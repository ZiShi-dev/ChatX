import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLimiter, type Deps } from '../src/authService.ts';
import { loadConfig } from '../src/config.ts';
import { GLOBAL_ROOM_ID } from '../src/home.ts';
import { createApi } from '../src/http.ts';
import { ERASE_OPERATOR_EMAIL } from '../src/eraseMember.ts';
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

describe('rooms', () => {
  it('opens one private chat, a group, and a private saved list', async () => {
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
    const noraHeaders = { cookie: `chatx_session=${noraToken}`, 'content-type': 'application/json', 'x-chatx-request': '1' };
    const laylaCookie = { cookie: `chatx_session=${laylaToken}` };
    const samiCookie = { cookie: `chatx_session=${samiToken}` };

    const denied = await handle(new Request('http://127.0.0.1/api/rooms', { method: 'POST', headers: noraHeaders, body: '{}' }));
    assert.equal(denied.status, 401);

    const first = await handle(new Request('http://127.0.0.1/api/rooms', {
      method: 'POST',
      headers: noraHeaders,
      body: JSON.stringify({ kind: 'private', userId: layla.id }),
    }));
    assert.equal(first.status, 200);
    const opened = await first.json() as { conversation: { id: string; type: string; participantIds: string[] } };
    assert.equal(opened.conversation.type, 'private');
    assert.deepEqual([...opened.conversation.participantIds].sort(), [layla.id, nora.id].sort());

    const second = await handle(new Request('http://127.0.0.1/api/rooms', {
      method: 'POST',
      headers: noraHeaders,
      body: JSON.stringify({ kind: 'private', userId: layla.id }),
    }));
    const again = await second.json() as { conversation: { id: string } };
    assert.equal(again.conversation.id, opened.conversation.id);

    const laylaHome = await handle(new Request('http://127.0.0.1/api/home', { headers: laylaCookie }));
    const laylaRooms = await laylaHome.json() as { conversations: Array<{ id: string }> };
    assert.equal(laylaRooms.conversations.some((room) => room.id === opened.conversation.id), true);
    const samiHome = await handle(new Request('http://127.0.0.1/api/home', { headers: samiCookie }));
    const samiRooms = await samiHome.json() as { conversations: Array<{ id: string }> };
    assert.equal(samiRooms.conversations.some((room) => room.id === opened.conversation.id), false);
    assert.equal(samiRooms.conversations[0]?.id, GLOBAL_ROOM_ID);

    const messageId = '44444444-4444-4444-8444-444444444444';
    const sent = await handle(new Request(`http://127.0.0.1/api/rooms/${opened.conversation.id}/messages`, {
      method: 'POST',
      headers: noraHeaders,
      body: JSON.stringify({ id: messageId, text: 'مساء الخير' }),
    }));
    assert.equal(sent.status, 200);

    const kept = await handle(new Request('http://127.0.0.1/api/saved', {
      method: 'POST',
      headers: { ...laylaCookie, 'content-type': 'application/json', 'x-chatx-request': '1' },
      body: JSON.stringify({ messageId, saved: true, userId: nora.id }),
    }));
    assert.equal(kept.status, 200);
    const saved = await handle(new Request('http://127.0.0.1/api/saved', { headers: laylaCookie }));
    const savedBody = await saved.json() as { saved: Array<{ messageId: string; conversationName: string; senderName: string; preview: string }> };
    assert.equal(savedBody.saved.length, 1);
    assert.equal(savedBody.saved[0]?.messageId, messageId);
    assert.equal(savedBody.saved[0]?.conversationName, 'نورة');
    assert.equal(savedBody.saved[0]?.senderName, 'نورة');
    assert.equal(savedBody.saved[0]?.preview, 'مساء الخير');
    const noraSaved = await handle(new Request('http://127.0.0.1/api/saved', { headers: { cookie: `chatx_session=${noraToken}` } }));
    const noraSavedBody = await noraSaved.json() as { saved: unknown[] };
    assert.equal(noraSavedBody.saved.length, 0);
    const roomAfterSave = await handle(new Request(`http://127.0.0.1/api/rooms/${opened.conversation.id}/messages`, { headers: noraHeaders }));
    assert.equal(roomAfterSave.status, 200);
    const visibleMessages = await roomAfterSave.json() as { messages: Array<Record<string, unknown>> };
    const visibleMessage = visibleMessages.messages.find((message) => message.id === messageId);
    assert.ok(visibleMessage);
    assert.equal('saved' in visibleMessage, false);
    assert.equal('savedBy' in visibleMessage, false);
    assert.equal('savedAt' in visibleMessage, false);
    assert.equal(JSON.stringify(savedBody).includes('example'), false);

    const dropped = await handle(new Request('http://127.0.0.1/api/saved', {
      method: 'POST',
      headers: { ...laylaCookie, 'content-type': 'application/json', 'x-chatx-request': '1' },
      body: JSON.stringify({ messageId, saved: false }),
    }));
    assert.equal(dropped.status, 200);
    const empty = await handle(new Request('http://127.0.0.1/api/saved', { headers: laylaCookie }));
    const emptyBody = await empty.json() as { saved: unknown[] };
    assert.equal(emptyBody.saved.length, 0);

    const tooSmall = await handle(new Request('http://127.0.0.1/api/rooms', {
      method: 'POST',
      headers: noraHeaders,
      body: JSON.stringify({ kind: 'group', name: 'المساء', memberIds: [layla.id] }),
    }));
    assert.equal(tooSmall.status, 401);

    const group = await handle(new Request('http://127.0.0.1/api/rooms', {
      method: 'POST',
      headers: noraHeaders,
      body: JSON.stringify({ kind: 'group', name: 'المساء', memberIds: [layla.id, sami.id] }),
    }));
    assert.equal(group.status, 200);
    const created = await group.json() as { conversation: { id: string; type: string; name: string } };
    assert.equal(created.conversation.type, 'group');
    assert.equal(created.conversation.name, 'المساء');
    const after = await handle(new Request('http://127.0.0.1/api/home', { headers: samiCookie }));
    const afterBody = await after.json() as { conversations: Array<{ id: string }> };
    assert.equal(afterBody.conversations.some((room) => room.id === created.conversation.id), true);
  });

  it('drops a private chat only after the other account is gone', async () => {
    const repo = createMemoryRepository();
    const nora = member('11111111-1111-4111-8111-111111111111', 'نورة');
    const layla = member('22222222-2222-4222-8222-222222222222', 'ليلى');
    const owner = member('44444444-4444-4444-8444-444444444444', 'المالك');
    owner.email = ERASE_OPERATOR_EMAIL;
    owner.googleSub = 'owner-sub';
    await repo.insertUser(nora);
    await repo.insertUser(layla);
    await repo.insertUser(owner);
    const roomId = '55555555-5555-4555-8555-555555555555';
    assert.equal(await repo.createRoom({ id: roomId, kind: 'private', name: null, creatorId: nora.id, memberIds: [layla.id], at: new Date(now) }), roomId);
    assert.equal(await repo.dropOrphanPrivate(roomId, nora.id), 'forbidden');
    assert.equal(await repo.eraseMember(owner.id, layla.id, {
      messages: true, images: true, files: true, reactions: true, privateChats: false, profile: true, membership: true, account: true,
    }), 'ok');
    assert.equal(await repo.dropOrphanPrivate(roomId, nora.id), 'ok');
    assert.equal(await repo.dropOrphanPrivate(roomId, nora.id), 'missing');
  });
});
