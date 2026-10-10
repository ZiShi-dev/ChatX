import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLimiter, resumeMember, type Deps } from '../src/authService.ts';
import { loadConfig } from '../src/config.ts';
import { createApi } from '../src/http.ts';
import { createMemoryRepository } from '../src/memory.ts';
import { cleanAccentColor, cleanBanner, cleanBio, cleanMessageFont } from '../src/profile.ts';
import { hashSession } from '../src/session.ts';
import type { AuthUser } from '../src/types.ts';

import { jpegUrl as jpeg } from './jpegFixture.ts';

function testDeps(): Deps {
  return {
    repo: createMemoryRepository(),
    config: loadConfig({ DATABASE_URL: 'postgres://unused', GOOGLE_CLIENT_ID: '' }),
    now: () => Date.parse('2026-10-08T12:00:00.000Z'),
    rateLimit: createLimiter(loadConfig({ DATABASE_URL: 'postgres://unused' }), () => Date.parse('2026-10-08T12:00:00.000Z')),
  };
}

const member: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'nora@example.com',
  displayName: 'نورة',
  username: 'نورة',
  role: 'member',
  bio: '',
  bannerUrl: null,
  avatarUrl: null,
};

describe('known account', () => {
  it('opens the existing member and leaves a new address on the profile step', async () => {
    const deps = testDeps();
    await deps.repo.insertUser(member);
    const known = await resumeMember(deps, 'Nora@example.com');
    assert.equal(known.ok && known.step, 'ready');
    if (known.ok && known.step === 'ready') assert.equal(known.user.displayName, 'نورة');
    const fresh = await resumeMember(deps, 'new@example.com');
    assert.equal(fresh.ok && fresh.step, 'profile');
  });
});

describe('profile', () => {
  it('keeps a short bio and a jpeg banner', () => {
    assert.equal(cleanAccentColor('#4d7ea8').ok, true);
    assert.equal(cleanAccentColor('#ffffff').ok, true);
    assert.equal(cleanMessageFont('classic').ok, true);
    assert.equal(cleanMessageFont('comic').ok, false);
    assert.equal(cleanBio('  مرحبا\u0000 '), 'مرحبا');
    assert.equal(cleanBio('ا'.repeat(161)), null);
    assert.equal(cleanBanner(jpeg).ok, true);
    const removed = cleanBanner(null);
    assert.equal(removed.ok && removed.value, null);
    assert.equal(cleanBanner('data:image/png;base64,/9j/AAAA').ok, false);
    assert.equal(cleanBanner('data:image/jpeg;base64,AAAA').ok, false);
  });

  it('stores the bio and banner only for the signed-in account', async () => {
    const deps = testDeps();
    await deps.repo.insertUser(member);
    const token = 'session-token';
    await deps.repo.createSession(hashSession(token), member.id, new Date('2026-11-08T12:00:00.000Z'));
    const handle = createApi(deps);
    const denied = await handle(new Request('http://127.0.0.1/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-chatx-request': '1' },
      body: JSON.stringify({ bio: 'نبذة' }),
    }));
    assert.equal(denied.status, 401);

    const saved = await handle(new Request('http://127.0.0.1/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-chatx-request': '1', cookie: `chatx_session=${token}` },
      body: JSON.stringify({ bio: 'نبذة قصيرة', banner: jpeg }),
    }));
    assert.equal(saved.status, 200);
    const body = await saved.json() as { user: { bio: string; bannerUrl: string } };
    assert.equal(body.user.bio, 'نبذة قصيرة');
    assert.equal(body.user.bannerUrl, jpeg);

    const renamed = await handle(new Request('http://127.0.0.1/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-chatx-request': '1', cookie: `chatx_session=${token}` },
      body: JSON.stringify({ displayName: 'نورة الجديدة', avatar: jpeg }),
    }));
    assert.equal(renamed.status, 200);
    const named = await renamed.json() as { user: { displayName: string; username: string; avatarUrl: string } };
    assert.equal(named.user.displayName, 'نورة الجديدة');
    assert.equal(named.user.username, 'نورة الجديدة');
    assert.equal(named.user.avatarUrl, jpeg);

    const loaded = await handle(new Request('http://127.0.0.1/api/profile', {
      headers: { cookie: `chatx_session=${token}` },
    }));
    assert.equal(loaded.status, 200);
    const account = await loaded.json() as { user: { displayName: string; bio: string } };
    assert.equal(account.user.displayName, 'نورة الجديدة');
    assert.equal(account.user.bio, 'نبذة قصيرة');

    await deps.repo.insertUser({
      ...member,
      id: '22222222-2222-4222-8222-222222222222',
      email: 'layla@example.com',
      displayName: 'ليلى',
      username: 'ليلى',
    });
    const taken = await handle(new Request('http://127.0.0.1/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-chatx-request': '1', cookie: `chatx_session=${token}` },
      body: JSON.stringify({ displayName: 'ليلى' }),
    }));
    assert.equal(taken.status, 409);

    const cleared = await handle(new Request('http://127.0.0.1/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-chatx-request': '1', cookie: `chatx_session=${token}` },
      body: JSON.stringify({ banner: null }),
    }));
    assert.equal(cleared.status, 200);
    const after = await cleared.json() as { user: { bannerUrl?: string; bio: string } };
    assert.equal(after.user.bannerUrl, undefined);
    assert.equal(after.user.bio, 'نبذة قصيرة');

    const rejected = await handle(new Request('http://127.0.0.1/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-chatx-request': '1', cookie: `chatx_session=${token}` },
      body: JSON.stringify({ banner: 'data:image/svg+xml;base64,PHN2Zy8+' }),
    }));
    assert.equal(rejected.status, 401);

    await handle(new Request('http://127.0.0.1/api/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chatx-request': '1', cookie: `chatx_session=${token}` },
      body: '{}',
    }));
    const closed = await handle(new Request('http://127.0.0.1/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-chatx-request': '1', cookie: `chatx_session=${token}` },
      body: JSON.stringify({ bio: 'بعد الخروج' }),
    }));
    assert.equal(closed.status, 401);
  });

  it('stores message color and font for every member', async () => {
    const deps = testDeps();
    await deps.repo.insertUser(member);
    const token = 'style-session';
    await deps.repo.createSession(hashSession(token), member.id, new Date('2026-11-08T12:00:00.000Z'));
    const handle = createApi(deps);

    const saved = await handle(new Request('http://127.0.0.1/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-chatx-request': '1', cookie: `chatx_session=${token}` },
      body: JSON.stringify({ color: '#c4893a', messageFont: 'rounded' }),
    }));
    assert.equal(saved.status, 200);
    const body = await saved.json() as { user: { color?: string; messageFont?: string } };
    assert.equal(body.user.color, '#c4893a');
    assert.equal(body.user.messageFont, 'rounded');

    const loaded = await handle(new Request('http://127.0.0.1/api/profile', {
      headers: { cookie: `chatx_session=${token}` },
    }));
    assert.equal(loaded.status, 200);
    const account = await loaded.json() as { user: { color?: string; messageFont?: string } };
    assert.equal(account.user.color, '#c4893a');
    assert.equal(account.user.messageFont, 'rounded');

    const custom = await handle(new Request('http://127.0.0.1/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-chatx-request': '1', cookie: `chatx_session=${token}` },
      body: JSON.stringify({ color: '#ffffff' }),
    }));
    assert.equal(custom.status, 200);
    const customBody = await custom.json() as { user: { color?: string } };
    assert.equal(customBody.user.color, '#ffffff');

    const rejected = await handle(new Request('http://127.0.0.1/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-chatx-request': '1', cookie: `chatx_session=${token}` },
      body: JSON.stringify({ color: 'red' }),
    }));
    assert.equal(rejected.status, 401);
  });
  it('persists optional profile cosmetics, removes them, and rejects unknown assets', async () => {
    const deps = testDeps(); await deps.repo.insertUser(member);
    const token = 'cosmetics-session';
    await deps.repo.createSession(hashSession(token), member.id, new Date('2026-11-08T12:00:00.000Z'));
    const api = createApi(deps);
    const patch = (body: unknown) => api(new Request('http://127.0.0.1/api/profile', {
      method: 'PATCH', headers: { 'content-type': 'application/json', 'x-chatx-request': '1', cookie: `chatx_session=${token}` }, body: JSON.stringify(body),
    }));
    assert.equal((await patch({ avatarDecoration: 'hat', profileEffect: 'stars' })).status, 200);
    const saved = await deps.repo.findUserById(member.id);
    assert.equal(saved?.avatarDecoration, 'hat'); assert.equal(saved?.profileEffect, 'stars');
    const loaded = await api(new Request('http://127.0.0.1/api/profile', { headers: { cookie: `chatx_session=${token}` } }));
    const body = await loaded.json() as { user: { avatarDecoration: string; profileEffect: string } };
    assert.equal(body.user.avatarDecoration, 'hat'); assert.equal(body.user.profileEffect, 'stars');
    assert.equal((await patch({ avatarDecoration: 'https://example.com/hat.gif', profileEffect: 'stars' })).status, 401);
    assert.equal((await patch({ profileEffect: '<script>' })).status, 401);
    assert.equal((await deps.repo.findUserById(member.id))?.avatarDecoration, 'hat');
    assert.equal((await patch({ avatarDecoration: null, profileEffect: 'none' })).status, 200);
    assert.equal((await deps.repo.findUserById(member.id))?.avatarDecoration, 'none');
    assert.equal((await deps.repo.findUserById(member.id))?.profileEffect, 'none');
  });
});
