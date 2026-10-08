import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLimiter, type Deps } from '../src/authService.ts';
import { loadConfig } from '../src/config.ts';
import { createApi } from '../src/http.ts';
import { createMemoryRepository } from '../src/memory.ts';
import { visiblePresence } from '../src/presence.ts';
import { hashSession } from '../src/session.ts';
import type { AuthUser } from '../src/types.ts';

const now = Date.parse('2026-10-08T12:00:00.000Z');

function testDeps(): Deps {
  return {
    repo: createMemoryRepository(),
    config: loadConfig({ DATABASE_URL: 'postgres://unused', GOOGLE_CLIENT_ID: '' }),
    now: () => now,
    rateLimit: createLimiter(loadConfig({ DATABASE_URL: 'postgres://unused' }), () => now),
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

describe('presence', () => {
  it('treats a fresh heartbeat as connected and an old one as disconnected', () => {
    assert.equal(visiblePresence({ presence: 'online', lastSeenAt: new Date(now - 10_000) }, now).status, 'online');
    assert.equal(visiblePresence({ presence: 'away', lastSeenAt: new Date(now - 10_000) }, now).status, 'away');
    assert.equal(visiblePresence({ presence: 'online', lastSeenAt: new Date(now - 46_000) }, now).status, 'offline');
  });

  it('requires the signed-in session and records who is connected', async () => {
    const deps = testDeps();
    await deps.repo.insertUser(member);
    const token = 'session-token';
    await deps.repo.createSession(hashSession(token), member.id, new Date(now + 60_000));
    const handle = createApi(deps);
    const denied = await handle(new Request('http://127.0.0.1/api/presence'));
    assert.equal(denied.status, 401);

    const beat = await handle(new Request('http://127.0.0.1/api/presence', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chatx-request': '1', cookie: `chatx_session=${token}` },
      body: JSON.stringify({ status: 'online' }),
    }));
    assert.equal(beat.status, 200);

    const listed = await handle(new Request('http://127.0.0.1/api/presence', {
      headers: { cookie: `chatx_session=${token}` },
    }));
    assert.equal(listed.status, 200);
    const body = await listed.json() as { users: Array<{ id: string; status: string; lastSeenAt: string }> };
    assert.equal(body.users[0]?.id, member.id);
    assert.equal(body.users[0]?.status, 'online');
    assert.equal(body.users[0]?.lastSeenAt, new Date(now).toISOString());

    const away = await handle(new Request('http://127.0.0.1/api/presence', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chatx-request': '1', cookie: `chatx_session=${token}` },
      body: JSON.stringify({ status: 'away' }),
    }));
    assert.equal(away.status, 200);
    const after = await handle(new Request('http://127.0.0.1/api/presence', {
      headers: { cookie: `chatx_session=${token}` },
    }));
    const awayBody = await after.json() as { users: Array<{ status: string }> };
    assert.equal(awayBody.users[0]?.status, 'away');
  });
});
