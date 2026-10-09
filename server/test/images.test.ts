import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLimiter, type Deps } from '../src/authService.ts';
import { loadConfig } from '../src/config.ts';
import { createApi } from '../src/http.ts';
import { createMemoryRepository } from '../src/memory.ts';
import { hashSession } from '../src/session.ts';
import type { AuthUser } from '../src/types.ts';

const now = Date.parse('2026-10-08T12:00:00.000Z');
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const image = `data:image/jpeg;base64,${jpeg.toString('base64')}`;

function testDeps(): Deps {
  return {
    repo: createMemoryRepository(),
    config: loadConfig({ DATABASE_URL: 'postgres://unused', GOOGLE_CLIENT_ID: '' }),
    now: () => now,
    rateLimit: createLimiter(loadConfig({ DATABASE_URL: 'postgres://unused' }), () => now),
  };
}

function member(id: string, name: string): AuthUser {
  return {
    id,
    email: `${id}@example.invalid`,
    displayName: name,
    username: name,
    role: 'member',
    bio: '',
    bannerUrl: null,
    avatarUrl: null,
  };
}

describe('chat images', () => {
  it('stores a small jpeg for the other member and hides the bytes from the thread', async () => {
    const deps = testDeps();
    const nora = member('11111111-1111-4111-8111-111111111111', 'نورة');
    const layla = member('22222222-2222-4222-8222-222222222222', 'ليلى');
    const sami = member('33333333-3333-4333-8333-333333333333', 'سامي');
    await deps.repo.insertUser(nora);
    await deps.repo.insertUser(layla);
    await deps.repo.insertUser(sami);
    const noraToken = 'nora-token';
    const laylaToken = 'layla-token';
    const samiToken = 'sami-token';
    await deps.repo.createSession(hashSession(noraToken), nora.id, new Date(now + 60_000));
    await deps.repo.createSession(hashSession(laylaToken), layla.id, new Date(now + 60_000));
    await deps.repo.createSession(hashSession(samiToken), sami.id, new Date(now + 60_000));
    const handle = createApi(deps);
    const headers = (token: string) => ({
      'content-type': 'application/json',
      'x-chatx-request': '1',
      cookie: `chatx_session=${token}`,
    });

    const opened = await handle(new Request('http://127.0.0.1/api/rooms', {
      method: 'POST',
      headers: headers(noraToken),
      body: JSON.stringify({ kind: 'private', userId: layla.id }),
    }));
    assert.equal(opened.status, 200);
    const roomId = ((await opened.json()) as { conversation: { id: string } }).conversation.id;
    const messageId = '44444444-4444-4444-8444-444444444444';

    const rejected = await handle(new Request(`http://127.0.0.1/api/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: headers(noraToken),
      body: JSON.stringify({ id: messageId, image: 'data:image/png;base64,aaaa' }),
    }));
    assert.equal(rejected.status, 401);

    const mixed = await handle(new Request(`http://127.0.0.1/api/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: headers(noraToken),
      body: JSON.stringify({ id: messageId, text: 'مرحبا', image }),
    }));
    assert.equal(mixed.status, 401);

    const sent = await handle(new Request(`http://127.0.0.1/api/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: headers(noraToken),
      body: JSON.stringify({ id: messageId, image }),
    }));
    assert.equal(sent.status, 200);

    const thread = await handle(new Request(`http://127.0.0.1/api/rooms/${roomId}/messages`, {
      headers: { cookie: `chatx_session=${laylaToken}` },
    }));
    const raw = await thread.text();
    assert.equal(raw.includes('/9j/'), false);
    const body = JSON.parse(raw) as { messages: Array<{ type?: string; text: string; fileSize?: number }> };
    assert.equal(body.messages[0]?.type, 'image');
    assert.equal(body.messages[0]?.text, '');
    assert.equal(body.messages[0]?.fileSize, jpeg.length);

    const picture = await handle(new Request(`http://127.0.0.1/api/rooms/${roomId}/messages/${messageId}/image`, {
      headers: { cookie: `chatx_session=${laylaToken}`, origin: 'https://localhost' },
    }));
    assert.equal(picture.status, 200);
    assert.equal(picture.headers.get('content-type'), 'image/jpeg');
    assert.match(picture.headers.get('vary') ?? '', /Cookie/i);
    assert.match(picture.headers.get('vary') ?? '', /Origin/i);
    assert.deepEqual(Buffer.from(await picture.arrayBuffer()), jpeg);

    const outsider = await handle(new Request(`http://127.0.0.1/api/rooms/${roomId}/messages/${messageId}/image`, {
      headers: { cookie: `chatx_session=${samiToken}` },
    }));
    assert.equal(outsider.status, 404);

    const home = await handle(new Request('http://127.0.0.1/api/home', {
      headers: { cookie: `chatx_session=${laylaToken}` },
    }));
    const listed = await home.json() as { conversations: Array<{ id: string; lastMessage?: { type?: string; text: string } }> };
    const room = listed.conversations.find((item) => item.id === roomId);
    assert.equal(room?.lastMessage?.type, 'image');
    assert.equal(room?.lastMessage?.text, '');
    assert.equal(JSON.stringify(listed).includes('/9j/'), false);

    const inbox = await handle(new Request('http://127.0.0.1/api/notifications', {
      headers: { cookie: `chatx_session=${laylaToken}` },
    }));
    const notices = await inbox.json() as { notifications: Array<{ preview: string; kind: string }> };
    const imageNotice = notices.notifications.find((item) => item.preview === 'صورة');
    assert.equal(imageNotice?.kind, 'message');
  });
});
