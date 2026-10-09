import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLimiter, type Deps } from '../src/authService.ts';
import { createRequestBudget } from '../src/requestBudget.ts';
import { loadConfig } from '../src/config.ts';
import { ERASE_OPERATOR_EMAIL } from '../src/eraseMember.ts';
import { GLOBAL_ROOM_ID } from '../src/home.ts';
import { createApi } from '../src/http.ts';
import { createMemoryRepository } from '../src/memory.ts';
import { hashSession } from '../src/session.ts';
import type { AuthUser } from '../src/types.ts';

const now = Date.parse('2026-10-08T12:00:00.000Z');
const operatorId = '11111111-1111-4111-8111-111111111111';
const memberId = '22222222-2222-4222-8222-222222222222';
const messageId = '33333333-3333-4333-8333-333333333333';
const roomId = '44444444-4444-4444-8444-444444444444';

function testDeps(): Deps {
  return {
    repo: createMemoryRepository(),
    config: loadConfig({ DATABASE_URL: 'postgres://unused', GOOGLE_CLIENT_ID: '' }),
    now: () => now,
    rateLimit: createLimiter(loadConfig({ DATABASE_URL: 'postgres://unused' }), () => now),
  };
}

function person(id: string, name: string, email: string, googleSub?: string): AuthUser {
  return { id, email, displayName: name, username: name, role: 'member', bio: '', bannerUrl: null, avatarUrl: null, ...(googleSub ? { googleSub } : {}) };
}

async function signedIn() {
  const deps = testDeps();
  const operator = person(operatorId, 'إبراهيم', ERASE_OPERATOR_EMAIL, 'google-operator');
  const member = person(memberId, 'أمينة', 'amina@example.com');
  await deps.repo.insertUser(operator);
  await deps.repo.insertUser(member);
  await deps.repo.createSession(hashSession('operator-token'), operator.id, new Date(now + 60_000));
  await deps.repo.createSession(hashSession('member-token'), member.id, new Date(now + 60_000));
  return { deps, handle: createApi(deps) };
}

function call(handle: ReturnType<typeof createApi>, path: string, token: string, body?: unknown) {
  return handle(new Request(`http://127.0.0.1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      cookie: `chatx_session=${token}`,
      origin: 'https://localhost',
      ...(body ? { 'content-type': 'application/json', 'x-chatx-request': '1' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }));
}

describe('owner tools', () => {
  it('shows the member list only to the Google operator', async () => {
    const { handle } = await signedIn();
    assert.equal((await call(handle, '/api/owner/members', '')).status, 401);
    assert.equal((await call(handle, '/api/owner/members', 'member-token')).status, 403);
    const listed = await call(handle, '/api/owner/members', 'operator-token');
    assert.equal(listed.status, 200);
    const body = await listed.json() as { users: Array<{ id: string; email?: string }> };
    assert.deepEqual(body.users.map((user) => user.id), [memberId]);
    assert.equal('email' in body.users[0]!, false);
    assert.equal((await handle(new Request('http://127.0.0.1/api/admin/users'))).status, 404);
  });

  it('deletes only the chosen data and refuses the operator account', async () => {
    const { deps, handle } = await signedIn();
    await deps.repo.ensureHome(operatorId);
    await deps.repo.ensureHome(memberId);
    const posted = await call(handle, `/api/rooms/${GLOBAL_ROOM_ID}/messages`, 'member-token', { id: messageId, text: 'رسالة' });
    assert.equal(posted.status, 200);
    await deps.repo.setReaction({ roomId: GLOBAL_ROOM_ID, messageId, userId: memberId, emoji: '❤️', at: new Date(now) });
    const created = await deps.repo.createRoom({ id: roomId, kind: 'private', name: null, creatorId: memberId, memberIds: [operatorId], at: new Date(now) });
    assert.equal(created, roomId);

    assert.equal((await call(handle, '/api/owner/erase', 'member-token', { userId: operatorId, account: true })).status, 403);
    assert.equal((await call(handle, '/api/owner/erase', 'operator-token', { userId: operatorId, account: true })).status, 403);
    assert.equal((await call(handle, '/api/owner/erase', 'operator-token', { userId: memberId })).status, 401);

    const reactions = await call(handle, '/api/owner/erase', 'operator-token', { userId: memberId, reactions: true });
    assert.equal(reactions.status, 200);
    assert.equal((await deps.repo.listReactions(GLOBAL_ROOM_ID)).some((item) => item.userId === memberId), false);
    assert.ok(await deps.repo.findUserById(memberId));

    const chats = await call(handle, '/api/owner/erase', 'operator-token', { userId: memberId, privateChats: true });
    assert.equal(chats.status, 200);
    const home = await deps.repo.listHome(operatorId, new Date(now));
    assert.equal(home.some((room) => room.id === roomId), false);
    assert.equal(home.some((room) => room.id === GLOBAL_ROOM_ID), true);

    const messages = await call(handle, '/api/owner/erase', 'operator-token', { userId: memberId, messages: true });
    assert.equal(messages.status, 200);
    const left = await deps.repo.listRoomMessages(GLOBAL_ROOM_ID, operatorId, 30);
    assert.equal(left?.some((item) => item.id === messageId), false);
    assert.ok(await deps.repo.findUserById(memberId));

    const account = await call(handle, '/api/owner/erase', 'operator-token', { userId: memberId, account: true });
    assert.equal(account.status, 200);
    assert.equal(await deps.repo.findUserById(memberId), null);
    assert.ok(await deps.repo.findUserById(operatorId));
    assert.equal((await deps.repo.listHome(operatorId, new Date(now))).some((room) => room.id === GLOBAL_ROOM_ID), true);
    const audit = await deps.repo.listOwnerAudit();
    assert.ok(audit.some((row) => row.action === 'member' && row.targetId === memberId && row.detail.includes('account')));
    assert.ok(audit.every((row) => row.actorId === operatorId && !row.detail.includes('@') && !row.detail.includes('رسالة')));
  });

  it('deletes a chosen group and keeps the main ChatX room', async () => {
    const { deps, handle } = await signedIn();
    const thirdId = '55555555-5555-4555-8555-555555555555';
    const groupId = '66666666-6666-4666-8666-666666666666';
    const groupMessage = '77777777-7777-4777-8777-777777777777';
    await deps.repo.insertUser(person(thirdId, 'ليلى', 'layla@example.com'));
    await deps.repo.ensureHome(operatorId);
    const created = await deps.repo.createRoom({
      id: groupId,
      kind: 'group',
      name: 'العائلة',
      creatorId: memberId,
      memberIds: [operatorId, thirdId],
      at: new Date(now),
    });
    assert.equal(created, groupId);
    const posted = await call(handle, `/api/rooms/${groupId}/messages`, 'member-token', { id: groupMessage, text: 'في المجموعة' });
    assert.equal(posted.status, 200);
    await deps.repo.setReaction({ roomId: groupId, messageId: groupMessage, userId: memberId, emoji: '❤️', at: new Date(now) });

    const listed = await call(handle, '/api/owner/members', 'operator-token');
    const body = await listed.json() as { groups: Array<{ id: string; name: string }> };
    assert.deepEqual(body.groups, [{ id: groupId, name: 'العائلة' }]);
    assert.equal((await call(handle, '/api/owner/groups/erase', 'member-token', { roomId: groupId, group: true })).status, 403);
    assert.equal((await call(handle, '/api/owner/groups/erase', 'operator-token', { roomId: GLOBAL_ROOM_ID, group: true })).status, 403);
    assert.equal((await call(handle, '/api/owner/groups/erase', 'operator-token', { roomId: groupId })).status, 401);

    assert.equal((await call(handle, '/api/owner/groups/erase', 'operator-token', { roomId: groupId, reactions: true })).status, 200);
    assert.equal((await deps.repo.listReactions(groupId)).length, 0);
    assert.equal((await deps.repo.listOwnerGroups()).length, 1);

    assert.equal((await call(handle, '/api/owner/groups/erase', 'operator-token', { roomId: groupId, messages: true })).status, 200);
    const left = await deps.repo.listRoomMessages(groupId, operatorId, 30);
    assert.equal(left?.some((item) => item.id === groupMessage), false);
    assert.equal((await deps.repo.listOwnerGroups()).some((item) => item.id === groupId), true);

    assert.equal((await call(handle, '/api/owner/groups/erase', 'operator-token', { roomId: groupId, group: true })).status, 200);
    assert.equal((await deps.repo.listOwnerGroups()).length, 0);
    assert.equal((await deps.repo.listHome(operatorId, new Date(now))).some((room) => room.id === GLOBAL_ROOM_ID), true);
    const audit = await deps.repo.listOwnerAudit();
    assert.equal(audit.filter((row) => row.action === 'group' && row.targetId === groupId).length, 3);
    assert.ok(audit.every((row) => !row.detail.includes('العائلة')));
  });

  it('rejects an unbound operator email, a request without the app header, and a fast repeat', async () => {
    const deps = testDeps();
    const operator = person(operatorId, 'إبراهيم', ERASE_OPERATOR_EMAIL);
    await deps.repo.insertUser(operator);
    await deps.repo.createSession(hashSession('operator-token'), operator.id, new Date(now + 60_000));
    const handle = createApi(deps);
    assert.equal((await call(handle, '/api/owner/members', 'operator-token')).status, 403);
    const missingHeader = await handle(new Request('http://127.0.0.1/api/owner/erase', {
      method: 'POST',
      headers: { cookie: 'chatx_session=operator-token', origin: 'https://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ userId: memberId, account: true }),
    }));
    assert.equal(missingHeader.status, 403);
    let clock = now;
    const budget = createRequestBudget(() => clock);
    const request = new Request('http://127.0.0.1/api/owner/erase', { method: 'POST', headers: { cookie: 'chatx_session=operator-token' } });
    for (let index = 0; index < 10; index += 1) assert.equal(budget(request, 'shared'), 0);
    assert.ok(budget(request, 'shared') > 0);
    clock += 60_000;
    assert.equal(budget(request, 'shared'), 0);
  });
});
