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

function testDeps() {
  let clock = now;
  const deps: Deps = {
    repo: createMemoryRepository(),
    config: loadConfig({ DATABASE_URL: 'postgres://unused', GOOGLE_CLIENT_ID: '' }),
    now: () => clock,
    rateLimit: createLimiter(loadConfig({ DATABASE_URL: 'postgres://unused' }), () => clock),
  };
  return { deps, advance: () => { clock += 1000; } };
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

describe('inbox', () => {
  it('creates a mention, an everyone notice, and a reply for the other member', async () => {
    const { deps, advance } = testDeps();
    const nora = member('11111111-1111-4111-8111-111111111111', 'نورة');
    const layla = member('22222222-2222-4222-8222-222222222222', 'ليلى');
    await deps.repo.insertUser(nora);
    await deps.repo.insertUser(layla);
    const noraToken = 'nora-token';
    const laylaToken = 'layla-token';
    await deps.repo.createSession(hashSession(noraToken), nora.id, new Date(now + 60_000));
    await deps.repo.createSession(hashSession(laylaToken), layla.id, new Date(now + 60_000));
    const handle = createApi(deps);
    const headers = { cookie: `chatx_session=${noraToken}` };
    const laylaHeaders = { cookie: `chatx_session=${laylaToken}` };

    const denied = await handle(new Request('http://127.0.0.1/api/notifications'));
    assert.equal(denied.status, 401);

    const mentionId = '33333333-3333-4333-8333-333333333333';
    const sent = await handle(new Request(`http://127.0.0.1/api/rooms/${GLOBAL_ROOM_ID}/messages`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-chatx-request': '1' },
      body: JSON.stringify({ id: mentionId, text: '@ليلى تفضلي' }),
    }));
    assert.equal(sent.status, 200);

    const inbox = await handle(new Request('http://127.0.0.1/api/notifications', { headers: laylaHeaders }));
    assert.equal(inbox.status, 200);
    const listed = await inbox.json() as { notifications: Array<{ id: string; kind: string; unread: boolean; senderId: string; senderName: string; preview: string }> };
    assert.equal(listed.notifications.length, 1);
    assert.equal(listed.notifications[0]?.kind, 'mention');
    assert.equal(listed.notifications[0]?.senderName, 'نورة');
    assert.equal(listed.notifications[0]?.unread, true);
    assert.equal(listed.notifications[0]?.senderId, nora.id);
    assert.equal(JSON.stringify(listed).includes('example'), false);

    const own = await handle(new Request('http://127.0.0.1/api/notifications', { headers }));
    const ownBody = await own.json() as { notifications: unknown[] };
    assert.equal(ownBody.notifications.length, 0);

    advance();
    const everyoneId = '44444444-4444-4444-8444-444444444444';
    await handle(new Request(`http://127.0.0.1/api/rooms/${GLOBAL_ROOM_ID}/messages`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-chatx-request': '1' },
      body: JSON.stringify({ id: everyoneId, text: '@everyone اجتماع' }),
    }));
    advance();
    const replyId = '55555555-5555-4555-8555-555555555555';
    await handle(new Request(`http://127.0.0.1/api/rooms/${GLOBAL_ROOM_ID}/messages`, {
      method: 'POST',
      headers: { ...laylaHeaders, 'content-type': 'application/json', 'x-chatx-request': '1' },
      body: JSON.stringify({ id: replyId, text: 'حاضر', replyToId: mentionId }),
    }));

    const noraInbox = await handle(new Request('http://127.0.0.1/api/notifications', { headers }));
    const noraBody = await noraInbox.json() as { notifications: Array<{ id: string; kind: string }> };
    assert.deepEqual(noraBody.notifications.map((item) => item.kind), ['reply']);
    assert.equal(noraBody.notifications[0]?.id, replyId);

    const laylaAgain = await handle(new Request('http://127.0.0.1/api/notifications', { headers: laylaHeaders }));
    const laylaBody = await laylaAgain.json() as { notifications: Array<{ id: string; kind: string }> };
    assert.deepEqual(laylaBody.notifications.map((item) => item.kind), ['everyone', 'mention']);

    const read = await handle(new Request('http://127.0.0.1/api/notifications/read', {
      method: 'POST',
      headers: { ...laylaHeaders, 'content-type': 'application/json', 'x-chatx-request': '1' },
      body: JSON.stringify({ ids: [mentionId] }),
    }));
    assert.equal(read.status, 200);
    const afterRead = await handle(new Request('http://127.0.0.1/api/notifications', { headers: laylaHeaders }));
    const readBody = await afterRead.json() as { notifications: Array<{ id: string; unread: boolean }> };
    assert.equal(readBody.notifications.find((item) => item.id === mentionId)?.unread, false);
    assert.equal(readBody.notifications.find((item) => item.id === everyoneId)?.unread, true);

    const cleared = await handle(new Request('http://127.0.0.1/api/notifications/clear', {
      method: 'POST',
      headers: { ...laylaHeaders, 'content-type': 'application/json', 'x-chatx-request': '1' },
    }));
    assert.equal(cleared.status, 200);
    const empty = await handle(new Request('http://127.0.0.1/api/notifications', { headers: laylaHeaders }));
    const emptyBody = await empty.json() as { notifications: unknown[] };
    assert.equal(emptyBody.notifications.length, 0);
  });

  it('stores a reaction, tells the author, and records who has seen the room', async () => {
    const { deps } = testDeps();
    const nora = member('11111111-1111-4111-8111-111111111111', 'نورة');
    const layla = member('22222222-2222-4222-8222-222222222222', 'ليلى');
    await deps.repo.insertUser(nora);
    await deps.repo.insertUser(layla);
    const noraToken = 'nora-token';
    const laylaToken = 'layla-token';
    await deps.repo.createSession(hashSession(noraToken), nora.id, new Date(now + 60_000));
    await deps.repo.createSession(hashSession(laylaToken), layla.id, new Date(now + 60_000));
    const handle = createApi(deps);
    const noraHeaders = { cookie: `chatx_session=${noraToken}`, 'content-type': 'application/json', 'x-chatx-request': '1' };
    const laylaHeaders = { cookie: `chatx_session=${laylaToken}`, 'content-type': 'application/json', 'x-chatx-request': '1' };
    const messageId = '55555555-5555-4555-8555-555555555555';

    const sent = await handle(new Request(`http://127.0.0.1/api/rooms/${GLOBAL_ROOM_ID}/messages`, {
      method: 'POST',
      headers: noraHeaders,
      body: JSON.stringify({ id: messageId, text: 'مرحبا' }),
    }));
    assert.equal(sent.status, 200);

    const reacted = await handle(new Request(`http://127.0.0.1/api/rooms/${GLOBAL_ROOM_ID}/messages/${messageId}/reaction`, {
      method: 'POST',
      headers: laylaHeaders,
      body: JSON.stringify({ emoji: '❤️' }),
    }));
    assert.equal(reacted.status, 200);

    const own = await handle(new Request(`http://127.0.0.1/api/rooms/${GLOBAL_ROOM_ID}/messages/${messageId}/reaction`, {
      method: 'POST',
      headers: noraHeaders,
      body: JSON.stringify({ emoji: '👍' }),
    }));
    assert.equal(own.status, 200);

    const inbox = await handle(new Request('http://127.0.0.1/api/notifications', { headers: { cookie: `chatx_session=${noraToken}` } }));
    const listed = await inbox.json() as { notifications: Array<{ kind: string; senderId: string; senderName: string; preview: string }> };
    assert.equal(listed.notifications.length, 1);
    assert.equal(listed.notifications[0]?.kind, 'reaction');
    assert.equal(listed.notifications[0]?.senderId, layla.id);
    assert.equal(listed.notifications[0]?.senderName, 'ليلى');
    assert.equal(listed.notifications[0]?.preview, '❤️');

    const thread = await handle(new Request(`http://127.0.0.1/api/rooms/${GLOBAL_ROOM_ID}/messages`, { headers: { cookie: `chatx_session=${noraToken}` } }));
    const body = await thread.json() as { messages: Array<{ reactions?: Array<{ emoji: string; userId: string }> }>; readers: Array<{ userId: string; messageId: string }> };
    const reactions = body.messages.find((item) => item.reactions)?.reactions ?? [];
    assert.equal(reactions.some((item) => item.userId === layla.id && item.emoji === '❤️'), true);
    assert.equal(reactions.some((item) => item.userId === nora.id && item.emoji === '👍'), true);

    const seen = await handle(new Request(`http://127.0.0.1/api/rooms/${GLOBAL_ROOM_ID}/messages`, { headers: { cookie: `chatx_session=${laylaToken}` } }));
    assert.equal(seen.status, 200);
    const read = await handle(new Request(`http://127.0.0.1/api/rooms/${GLOBAL_ROOM_ID}/read`, {
      method: 'POST', headers: laylaHeaders, body: JSON.stringify({ messageId }),
    }));
    assert.equal(read.status, 200);
    const after = await handle(new Request(`http://127.0.0.1/api/rooms/${GLOBAL_ROOM_ID}/messages`, { headers: { cookie: `chatx_session=${noraToken}` } }));
    const readers = (await after.json() as { readers: Array<{ userId: string; messageId: string }> }).readers;
    assert.equal(readers.some((item) => item.userId === layla.id && item.messageId === messageId), true);

    const removed = await handle(new Request(`http://127.0.0.1/api/rooms/${GLOBAL_ROOM_ID}/messages/${messageId}/reaction`, {
      method: 'POST',
      headers: laylaHeaders,
      body: JSON.stringify({ emoji: '' }),
    }));
    assert.equal(removed.status, 200);
    const quiet = await handle(new Request('http://127.0.0.1/api/notifications', { headers: { cookie: `chatx_session=${noraToken}` } }));
    const left = await quiet.json() as { notifications: Array<{ kind: string }> };
    assert.equal(left.notifications.some((item) => item.kind === 'reaction'), false);
  });

  it('notifies only the other person and keeps a cursor for older notices', async () => {
    const { deps, advance } = testDeps();
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
    const noraHeaders = { cookie: `chatx_session=${noraToken}`, 'content-type': 'application/json', 'x-chatx-request': '1' };

    const opened = await handle(new Request('http://127.0.0.1/api/rooms', {
      method: 'POST',
      headers: noraHeaders,
      body: JSON.stringify({ kind: 'private', userId: layla.id }),
    }));
    const room = await opened.json() as { conversation: { id: string } };
    const firstId = '44444444-4444-4444-8444-444444444444';
    await handle(new Request(`http://127.0.0.1/api/rooms/${room.conversation.id}/messages`, {
      method: 'POST',
      headers: noraHeaders,
      body: JSON.stringify({ id: firstId, text: 'الأولى' }),
    }));
    advance();
    const secondId = '55555555-5555-4555-8555-555555555555';
    await handle(new Request(`http://127.0.0.1/api/rooms/${room.conversation.id}/messages`, {
      method: 'POST',
      headers: noraHeaders,
      body: JSON.stringify({ id: secondId, text: 'الثانية' }),
    }));

    const inbox = await handle(new Request('http://127.0.0.1/api/notifications', { headers: { cookie: `chatx_session=${laylaToken}` } }));
    const listed = await inbox.json() as { notifications: Array<{ id: string; conversationName: string; senderName: string }>; unreadCount: number };
    const privateNotes = listed.notifications.filter((item) => item.id === firstId || item.id === secondId);
    assert.equal(privateNotes.length, 2);
    assert.equal(listed.unreadCount, listed.notifications.length);
    assert.equal(listed.notifications[0]?.id, secondId);
    assert.equal(listed.notifications[0]?.conversationName, 'نورة');
    assert.equal(listed.notifications[0]?.senderName, 'نورة');
    const samiInbox = await handle(new Request('http://127.0.0.1/api/notifications', { headers: { cookie: `chatx_session=${samiToken}` } }));
    const samiBody = await samiInbox.json() as { notifications: Array<{ id: string }>; unreadCount: number };
    assert.equal(samiBody.notifications.some((item) => item.id === firstId || item.id === secondId), false);
    assert.equal(JSON.stringify(listed).includes('example'), false);

    const newest = await deps.repo.listNotifications(layla.id, 10, null);
    const second = newest.find((item) => item.messageId === secondId);
    assert.ok(second);
    const older = await deps.repo.listNotifications(layla.id, 10, { at: second.createdAt, messageId: second.messageId });
    assert.equal(older.some((item) => item.messageId === firstId), true);
    assert.equal(older.some((item) => item.messageId === secondId), false);

    const bad = await handle(new Request(`http://127.0.0.1/api/notifications?before=nope&beforeId=${firstId}`, {
      headers: { cookie: `chatx_session=${laylaToken}` },
    }));
    assert.equal(bad.status, 401);
  });
});
