import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLimiter, type Deps } from '../src/authService.ts';
import { loadConfig } from '../src/config.ts';
import { GLOBAL_ROOM_ID } from '../src/home.ts';
import { createApi } from '../src/http.ts';
import { createMemoryRepository } from '../src/memory.ts';
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

function member(id: string, name: string, email: string): AuthUser {
  return {
    id,
    email,
    displayName: name,
    username: name,
    role: 'member',
    bio: '',
    bannerUrl: null,
    avatarUrl: null,
  };
}

describe('home', () => {
  it('validates unchanged responses only after authorization and sends changed data normally', async () => {
    const deps = testDeps();
    const nora = member('11111111-1111-4111-8111-111111111111', 'نورة', 'nora@example.com');
    await deps.repo.insertUser(nora);
    await deps.repo.createSession(hashSession('conditional-token'), nora.id, new Date(now + 60_000));
    const handle = createApi(deps);
    const headers = { cookie: 'chatx_session=conditional-token', origin: 'https://localhost' };
    const first = await handle(new Request('http://localhost/api/home', { headers }));
    const etag = first.headers.get('etag');
    assert.ok(etag);
    assert.equal(first.headers.get('access-control-expose-headers'), 'etag, date');
    assert.ok((await first.text()).length > 0);
    const unchanged = await handle(new Request('http://localhost/api/home', { headers: { ...headers, 'if-none-match': etag } }));
    assert.equal(unchanged.status, 304);
    assert.equal((await unchanged.arrayBuffer()).byteLength, 0);
    const denied = await handle(new Request('http://localhost/api/home', { headers: { 'if-none-match': etag } }));
    assert.equal(denied.status, 401);
    const posted = await handle(new Request(`http://localhost/api/rooms/${GLOBAL_ROOM_ID}/messages`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json', 'x-chatx-request': '1' },
      body: JSON.stringify({ id: '33333333-3333-4333-8333-333333333333', text: 'New message' }),
    }));
    assert.equal(posted.status, 200);
    const changed = await handle(new Request('http://localhost/api/home', { headers: { ...headers, 'if-none-match': etag } }));
    assert.equal(changed.status, 200);
    assert.notEqual(changed.headers.get('etag'), etag);
    assert.ok((await changed.text()).includes('New message'));
  });
  it('shows ChatX for a signed-in member and counts an unread message', async () => {
    const deps = testDeps();
    const nora = member('11111111-1111-4111-8111-111111111111', 'نورة', 'nora@example.com');
    const layla = member('22222222-2222-4222-8222-222222222222', 'ليلى', 'layla@example.com');
    await deps.repo.insertUser(nora);
    await deps.repo.insertUser(layla);
    const noraToken = 'nora-token';
    const laylaToken = 'layla-token';
    await deps.repo.createSession(hashSession(noraToken), nora.id, new Date(now + 60_000));
    await deps.repo.createSession(hashSession(laylaToken), layla.id, new Date(now + 60_000));
    const handle = createApi(deps);

    const denied = await handle(new Request('http://127.0.0.1/api/home'));
    assert.equal(denied.status, 401);

    const home = await handle(new Request('http://127.0.0.1/api/home', { headers: { cookie: `chatx_session=${noraToken}` } }));
    assert.equal(home.status, 200);
    const listed = await home.json() as { conversations: Array<{ id: string; type: string; name?: string; unreadCount: number; lastMessage?: { senderId: string } }>; users: Array<{ id: string }> };
    assert.equal(listed.conversations[0]?.id, GLOBAL_ROOM_ID);
    assert.equal(listed.conversations[0]?.type, 'global');
    assert.equal(listed.conversations[0]?.name, 'ChatX');
    assert.equal(listed.conversations[0]?.unreadCount, listed.conversations[0]?.lastMessage?.senderId === nora.id ? 0 : 1);
    assert.equal(listed.users.some((user) => user.id === layla.id), true);
    assert.equal(JSON.stringify(listed).includes('example.com'), false);

    const messageId = '33333333-3333-4333-8333-333333333333';
    const sent = await handle(new Request(`http://127.0.0.1/api/rooms/${GLOBAL_ROOM_ID}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chatx-request': '1', cookie: `chatx_session=${noraToken}` },
      body: JSON.stringify({ id: messageId, text: 'مرحبا' }),
    }));
    assert.equal(sent.status, 200);

    const laylaHome = await handle(new Request('http://127.0.0.1/api/home', { headers: { cookie: `chatx_session=${laylaToken}` } }));
    const laylaBody = await laylaHome.json() as { conversations: Array<{ unreadCount: number; lastMessage?: { text: string; senderId: string } }> };
    assert.ok((laylaBody.conversations[0]?.unreadCount ?? 0) >= 1);
    assert.equal(laylaBody.conversations[0]?.lastMessage?.text, 'مرحبا');
    assert.equal(laylaBody.conversations[0]?.lastMessage?.senderId, nora.id);

    const thread = await handle(new Request(`http://127.0.0.1/api/rooms/${GLOBAL_ROOM_ID}/messages`, {
      headers: { cookie: `chatx_session=${laylaToken}` },
    }));
    assert.equal(thread.status, 200);
    const opened = await thread.json() as { messages: Array<{ id: string; text: string }> };
    assert.equal(opened.messages.some((message) => message.text === 'مرحبا'), true);
    const latestId = opened.messages.map((message) => message.id).sort().at(-1);

    const read = await handle(new Request(`http://127.0.0.1/api/rooms/${GLOBAL_ROOM_ID}/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chatx-request': '1', cookie: `chatx_session=${laylaToken}` },
      body: JSON.stringify({ messageId: latestId }),
    }));
    assert.equal(read.status, 200);
    const readCounts = await read.json() as { unreadCount: number; unreadNotifications: number };
    assert.equal(readCounts.unreadCount, 0);
    assert.equal(readCounts.unreadNotifications, 0);

    const after = await handle(new Request('http://127.0.0.1/api/home', { headers: { cookie: `chatx_session=${laylaToken}` } }));
    const cleared = await after.json() as { conversations: Array<{ unreadCount: number }> };
    assert.equal(cleared.conversations[0]?.unreadCount, 0);
  });
});
