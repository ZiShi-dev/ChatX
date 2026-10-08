import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLimiter, type Deps } from '../src/authService.ts';
import { loadConfig } from '../src/config.ts';
import { createApi } from '../src/http.ts';
import { createMemoryRepository } from '../src/memory.ts';
import { hashSession } from '../src/session.ts';
import type { AuthUser } from '../src/types.ts';
import { advanceGroupTurn, GROUP_TURN_MS, groupTurnNotice } from '../src/groupTurn.ts';
import { GLOBAL_ROOM_ID, groupChangeLine } from '../src/home.ts';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const c = '33333333-3333-4333-8333-333333333333';
const now = Date.parse('2026-10-08T12:00:00.000Z');

describe('group turn', () => {
  it('describes a name and photo change in one line', () => {
    assert.equal(groupChangeLine('نورة', { name: 'الصباح', avatar: 'photo' }), 'نورة غيّر اسم المجموعة إلى «الصباح» وغيّر صورة المجموعة');
    assert.equal(groupChangeLine('نورة', {}), '');
    assert.equal(groupTurnNotice('ليلى', now, now), 'دور ليلى لتعديل اسم المجموعة وصورتها');
    assert.equal(groupTurnNotice('ليلى', now + GROUP_TURN_MS, now).startsWith('دور ليلى لتعديل اسم المجموعة وصورتها في '), true);
  });
  it('gives the turn to the others, in a random order, before it returns', () => {
    const first = advanceGroupTurn({
      members: [a, b, c],
      holderId: a,
      opensAt: now,
      round: 1,
      done: [],
      actorId: a,
      now,
      changedIdentity: true,
      random: () => 0,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.holderId, b);
    assert.equal(first.opensAt, now + GROUP_TURN_MS);
    assert.deepEqual(first.done, [a]);

    const early = advanceGroupTurn({
      members: [a, b, c],
      holderId: first.holderId,
      opensAt: first.opensAt,
      round: first.round,
      done: first.done,
      actorId: b,
      now,
      changedIdentity: true,
      random: () => 0,
    });
    assert.equal(early.ok, false);

    const second = advanceGroupTurn({
      members: [a, b, c],
      holderId: first.holderId,
      opensAt: first.opensAt,
      round: first.round,
      done: first.done,
      actorId: b,
      now: first.opensAt,
      changedIdentity: true,
      random: () => 0,
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.holderId, c);
    assert.deepEqual(second.done, [a, b]);

    const third = advanceGroupTurn({
      members: [a, b, c],
      holderId: second.holderId,
      opensAt: second.opensAt,
      round: second.round,
      done: second.done,
      actorId: c,
      now: second.opensAt,
      changedIdentity: true,
      random: () => 0,
    });
    assert.equal(third.ok, true);
    if (!third.ok) return;
    assert.equal(third.holderId, a);
    assert.equal(third.done.length, 0);
    assert.notEqual(third.holderId, c);
  });

  it('keeps the same person when only the description changes', () => {
    const kept = advanceGroupTurn({
      members: [a, b],
      holderId: a,
      opensAt: now,
      round: 1,
      done: [],
      actorId: a,
      now,
      changedIdentity: false,
      random: () => 0,
    });
    assert.deepEqual(kept, { ok: true, holderId: a, opensAt: now, round: 1, done: [] });
  });

  it('lets the only member edit without waiting', () => {
    const alone = advanceGroupTurn({
      members: [a],
      holderId: null,
      opensAt: now + GROUP_TURN_MS,
      round: 1,
      done: [a],
      actorId: a,
      now,
      changedIdentity: true,
      random: () => 0,
    });
    assert.deepEqual(alone, { ok: true, holderId: a, opensAt: now, round: 1, done: [] });
  });

  it('keeps a change for seven days and waits for the others before the same person returns', async () => {
    let clock = now;
    const deps: Deps = {
      repo: createMemoryRepository(),
      config: loadConfig({ DATABASE_URL: 'postgres://unused', GOOGLE_CLIENT_ID: '' }),
      now: () => clock,
      rateLimit: createLimiter(loadConfig({ DATABASE_URL: 'postgres://unused' }), () => clock),
    };
    const people = [
      member(a, 'نورة'),
      member(b, 'ليلى'),
      member(c, 'سامي'),
    ];
    const tokens = ['nora-token', 'layla-token', 'sami-token'];
    for (const [index, person] of people.entries()) {
      await deps.repo.insertUser(person);
      await deps.repo.createSession(hashSession(tokens[index] ?? ''), person.id, new Date(now + 40 * GROUP_TURN_MS));
    }
    const handle = createApi(deps);
    const headers = (token: string) => ({ cookie: `chatx_session=${token}`, 'content-type': 'application/json', 'x-chatx-request': '1' });
    const created = await handle(new Request('http://127.0.0.1/api/rooms', {
      method: 'POST',
      headers: headers(tokens[0] ?? ''),
      body: JSON.stringify({ kind: 'group', name: 'المساء', memberIds: [b, c] }),
    }));
    assert.equal(created.status, 200);
    const group = await created.json() as { conversation: { id: string; turnUserId: string; turnOpensAt: string } };
    const holder = group.conversation.turnUserId;
    const holderToken = tokens[people.findIndex((person) => person.id === holder)] ?? '';
    const patch = (token: string, body: Record<string, string>) => handle(new Request(`http://127.0.0.1/api/rooms/${group.conversation.id}`, {
      method: 'PATCH',
      headers: headers(token),
      body: JSON.stringify(body),
    }));
    for (const [index, person] of people.entries()) {
      if (person.id === holder) continue;
      assert.equal((await patch(tokens[index] ?? '', { name: 'ممنوع' })).status, 403);
    }
    const described = await patch(holderToken, { bio: 'وصف' });
    assert.equal(described.status, 200);
    const same = await described.json() as { conversation: { name: string; turnUserId: string } };
    assert.equal(same.conversation.name, 'المساء');
    assert.equal(same.conversation.turnUserId, holder);
    const quiet = await handle(new Request(`http://127.0.0.1/api/rooms/${group.conversation.id}/messages`, { headers: { cookie: `chatx_session=${holderToken}` } }));
    const quietBody = await quiet.json() as { messages: Array<{ text: string; event?: boolean }> };
    assert.equal(quietBody.messages.length, 1);
    assert.equal(quietBody.messages[0]?.event, true);
    assert.equal(quietBody.messages[0]?.text.includes('غيّر'), false);

    const renamed = await patch(holderToken, { name: 'الصباح' });
    assert.equal(renamed.status, 200);
    const first = await renamed.json() as { conversation: { name: string; turnUserId: string; turnOpensAt: string } };
    assert.equal(first.conversation.name, 'الصباح');
    assert.notEqual(first.conversation.turnUserId, holder);
    const thread = await handle(new Request(`http://127.0.0.1/api/rooms/${group.conversation.id}/messages`, { headers: { cookie: `chatx_session=${holderToken}` } }));
    const posted = await thread.json() as { messages: Array<{ text: string; event?: boolean; senderId: string }> };
    const actor = people.find((person) => person.id === holder)?.displayName ?? '';
    const change = posted.messages.find((message) => message.text.includes('الصباح'));
    assert.equal(change?.event, true);
    assert.equal(change?.senderId, holder);
    assert.equal(change?.text, `${actor} غيّر اسم المجموعة إلى «الصباح»`);
    const nextName = people.find((person) => person.id === first.conversation.turnUserId)?.displayName ?? '';
    assert.equal(posted.messages.some((message) => message.event && message.text.startsWith(`دور ${nextName}`)), true);
    assert.ok(Date.parse(first.conversation.turnOpensAt) >= clock + GROUP_TURN_MS);
    const secondId = first.conversation.turnUserId;
    const secondToken = tokens[people.findIndex((person) => person.id === secondId)] ?? '';
    assert.equal((await patch(secondToken, { name: 'مبكر' })).status, 403);
    assert.equal((await patch(holderToken, { name: 'مرة أخرى' })).status, 403);

    clock = Date.parse(first.conversation.turnOpensAt);
    const second = await patch(secondToken, { name: 'الظهر' });
    assert.equal(second.status, 200);
    const moved = await second.json() as { conversation: { turnUserId: string; turnOpensAt: string } };
    const thirdId = people.map((person) => person.id).find((id) => id !== holder && id !== secondId);
    assert.equal(moved.conversation.turnUserId, thirdId);

    clock = Date.parse(moved.conversation.turnOpensAt);
    const thirdToken = tokens[people.findIndex((person) => person.id === thirdId)] ?? '';
    const third = await patch(thirdToken, { name: 'المغرب' });
    assert.equal(third.status, 200);
    const round = await third.json() as { conversation: { turnUserId: string } };
    assert.notEqual(round.conversation.turnUserId, thirdId);
    assert.equal([holder, secondId].includes(round.conversation.turnUserId), true);
  });

  it('gives ChatX the same turn as the other groups', async () => {
    let clock = now;
    const deps: Deps = {
      repo: createMemoryRepository(),
      config: loadConfig({ DATABASE_URL: 'postgres://unused', GOOGLE_CLIENT_ID: '' }),
      now: () => clock,
      rateLimit: createLimiter(loadConfig({ DATABASE_URL: 'postgres://unused' }), () => clock),
    };
    const nora = member(a, 'نورة');
    const layla = member(b, 'ليلى');
    await deps.repo.insertUser(nora);
    await deps.repo.insertUser(layla);
    await deps.repo.createSession(hashSession('nora-token'), nora.id, new Date(now + 40 * GROUP_TURN_MS));
    await deps.repo.createSession(hashSession('layla-token'), layla.id, new Date(now + 40 * GROUP_TURN_MS));
    const handle = createApi(deps);
    const headers = (token: string) => ({ cookie: `chatx_session=${token}`, 'content-type': 'application/json', 'x-chatx-request': '1' });
    await handle(new Request('http://127.0.0.1/api/home', { headers: { cookie: 'chatx_session=nora-token' } }));
    const home = await handle(new Request('http://127.0.0.1/api/home', { headers: { cookie: 'chatx_session=layla-token' } }));
    const body = await home.json() as { conversations: Array<{ id: string; type: string; turnUserId?: string }> };
    const main = body.conversations.find((room) => room.id === GLOBAL_ROOM_ID);
    assert.equal(main?.type, 'global');
    assert.ok(main?.turnUserId === nora.id || main?.turnUserId === layla.id);
    const holderToken = main?.turnUserId === nora.id ? 'nora-token' : 'layla-token';
    const otherToken = holderToken === 'nora-token' ? 'layla-token' : 'nora-token';
    const inbox = async (token: string) => {
      const response = await handle(new Request('http://127.0.0.1/api/notifications', { headers: { cookie: `chatx_session=${token}` } }));
      return response.json() as Promise<{ notifications: Array<{ kind: string; preview: string }> }>;
    };
    const holderName = main?.turnUserId === nora.id ? 'نورة' : 'ليلى';
    const chosen = await inbox(holderToken);
    assert.equal(chosen.notifications.some((item) => item.kind === 'signal' && item.preview.includes(`دور ${holderName}`)), true);
    const other = await inbox(otherToken);
    assert.equal(other.notifications.some((item) => item.kind === 'signal'), false);
    const patch = (token: string, name: string) => handle(new Request(`http://127.0.0.1/api/rooms/${GLOBAL_ROOM_ID}`, {
      method: 'PATCH',
      headers: headers(token),
      body: JSON.stringify({ name }),
    }));
    assert.equal((await patch(otherToken, 'ممنوع')).status, 403);
    const renamed = await patch(holderToken, 'الساحة');
    assert.equal(renamed.status, 200);
    const saved = await renamed.json() as { conversation: { name: string; type: string; turnUserId: string; turnOpensAt: string } };
    assert.equal(saved.conversation.name, 'الساحة');
    assert.equal(saved.conversation.type, 'global');
    assert.notEqual(saved.conversation.turnUserId, main?.turnUserId);
    assert.ok(Date.parse(saved.conversation.turnOpensAt) >= clock + GROUP_TURN_MS);
    assert.equal((await patch(saved.conversation.turnUserId === nora.id ? 'nora-token' : 'layla-token', 'مبكر')).status, 403);
    const nextToken = saved.conversation.turnUserId === nora.id ? 'nora-token' : 'layla-token';
    const nextName = saved.conversation.turnUserId === nora.id ? 'نورة' : 'ليلى';
    const nextInbox = await inbox(nextToken);
    assert.equal(nextInbox.notifications.some((item) => item.kind === 'signal' && item.preview.includes(`دور ${nextName}`) && item.preview.includes('في')), true);
    const thread = await handle(new Request(`http://127.0.0.1/api/rooms/${GLOBAL_ROOM_ID}/messages`, { headers: { cookie: `chatx_session=${holderToken}` } }));
    const posted = await thread.json() as { messages: Array<{ text: string; event?: boolean }> };
    assert.equal(posted.messages.some((message) => message.event && message.text.includes('الساحة')), true);
  });
});

function member(id: string, name: string): AuthUser {
  return { id, email: `${id}@example.invalid`, displayName: name, username: name, role: 'member', bio: '', bannerUrl: null, avatarUrl: null };
}
