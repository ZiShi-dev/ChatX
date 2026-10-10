import { verifyLowBandwidth } from './lowBandwidthCases.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { createMemoryRepository } from '../src/memory.ts';
import { createPostgresRepository } from '../src/postgres.ts';
import { migrate } from '../src/migrate.ts';
import { GLOBAL_ROOM_ID, readRoomMessages, changeMessage, markRoomSeen } from '../src/home.ts';
import { createLimiter, type Deps } from '../src/authService.ts';
import { loadConfig } from '../src/config.ts';
import { hashSession } from '../src/session.ts';
import type { AuthRepository, AuthUser, RoomMessage } from '../src/types.ts';

const now = new Date('2026-10-09T12:00:00Z');
const user = (id: string): AuthUser => ({ id, email: `${id}@example.invalid`, displayName: id, username: id, role: 'member', bio: '', avatarUrl: null, bannerUrl: null });
async function verifyTurnNotifications(repo: AuthRepository) {
  const people = Array.from({ length: 3 }, () => user(randomUUID()));
  const outsider = user(randomUUID());
  for (const person of [...people, outsider]) await repo.insertUser(person);
  const roomId = randomUUID();
  await repo.createRoom({ id: roomId, kind: 'group', creatorId: people[0].id, memberIds: people.slice(1).map(person => person.id), name: 'turn notices', at: now });
  const message: RoomMessage = { id: randomUUID(), roomId, senderId: people[0].id, text: 'دور عضو لتعديل اسم المجموعة وصورتها', createdAt: now, deleted: false, event: true };
  await repo.addRoomMessage(message);
  await Promise.all([repo.notifyTurnMembers(message), repo.notifyTurnMembers(message)]);
  for (const person of people) {
    const notices = (await repo.listNotifications(person.id, 30, null)).filter(notice => notice.messageId === message.id);
    assert.equal(notices.length, 1);
    assert.equal(notices[0].kind, 'signal');
    assert.equal(notices[0].read, false);
  }
  assert.deepEqual(await repo.listNotifications(outsider.id, 30, null), []);
  await repo.markNotificationsRead(people[0].id, [message.id], now);
  assert.equal((await repo.listNotifications(people[0].id, 30, null))[0].read, true);
  assert.equal((await repo.listNotifications(people[1].id, 30, null))[0].read, false);
  return { people, message };
}
async function verifyNotificationCutoffs(repo: AuthRepository) {
  const { people, message } = await verifyTurnNotifications(repo);
  const future: RoomMessage = { ...message, id: randomUUID(), createdAt: new Date(now.getTime() + 1000) };
  await repo.addRoomMessage(future); await repo.notifyTurnMembers(future);
  await repo.markNotificationsRead(people[1].id, 'all', future.createdAt, now);
  await repo.markNotificationsRead(people[1].id, [future.id], future.createdAt, now);
  assert.equal((await repo.listNotifications(people[1].id, 30, null)).find(item => item.messageId === message.id)?.read, true);
  assert.equal((await repo.listNotifications(people[1].id, 30, null)).find(item => item.messageId === future.id)?.read, false);
  await repo.clearNotifications(people[1].id, now);
  assert.equal((await repo.listNotifications(people[1].id, 30, null)).some(item => item.messageId === message.id), false);
  assert.equal((await repo.listNotifications(people[1].id, 30, null)).some(item => item.messageId === future.id), true);
}
async function verifyGroupRotation(repo: AuthRepository) {
  const people = [user(randomUUID()), user(randomUUID()), user(randomUUID())];
  for (const person of people) await repo.insertUser(person);
  const roomId = randomUUID();
  const week = 7 * 24 * 60 * 60 * 1000;
  assert.equal(await repo.createRoom({ id: roomId, kind: 'group', creatorId: people[0].id,
    memberIds: people.slice(1).map((person) => person.id), name: 'weekly', at: now }), roomId);
  const read = async (at: Date) => (await repo.listHome(people[0].id, at)).find((room) => room.id === roomId)!;
  let room = await read(now);
  let previous: string | undefined;
  for (let cycle = 0; cycle < 2; cycle += 1) {
    const seen = new Set<string>();
    for (let index = 0; index < people.length; index += 1) {
      const holder = room.turnUserId!;
      assert.notEqual(holder, previous);
      assert.equal(seen.has(holder), false);
      seen.add(holder);
      const starts = room.turnOpensAt!.getTime();
      assert.equal(await repo.updateRoom(roomId, holder, { name: 'first edit' }, new Date(starts)), true);
      assert.equal(await repo.updateRoom(roomId, holder, { name: 'last edit', avatar: null }, new Date(starts + week - 1)), true);
      assert.equal((await read(new Date(starts + week - 1))).turnUserId, holder);
      const concurrent = await Promise.all([read(new Date(starts + week)), read(new Date(starts + week))]);
      const direct = await Promise.all([repo.readGroupTurn(roomId, people[0].id, new Date(starts + week)), repo.readGroupTurn(roomId, people[0].id, new Date(starts + week))]);
      assert.equal(direct[0]?.holderId, concurrent[0].turnUserId);
      assert.equal(direct[1]?.holderId, direct[0]?.holderId);
      assert.equal(direct[0]?.opensAt, starts + week);
      assert.equal(await repo.updateRoom(roomId, holder, { name: 'expired' }, new Date(starts + week)), false);
      assert.equal(concurrent[0].turnUserId, concurrent[1].turnUserId);
      assert.equal(concurrent[0].turnOpensAt!.getTime(), starts + week);
      previous = holder;
      room = concurrent[0];
    }
    assert.equal(seen.size, people.length);
  }
  assert.equal(await repo.readGroupTurn(roomId, randomUUID(), now), null);
}
async function verify(repo: AuthRepository) {
  const alice = user(randomUUID()); const bob = user(randomUUID()); const outsider = user(randomUUID());
  for (const person of [alice, bob, outsider]) await repo.insertUser(person);
  const roomId = randomUUID();
  assert.equal(await repo.createRoom({ id: roomId, kind: 'private', creatorId: alice.id, memberIds: [bob.id], at: now, name: null }), roomId);
  const paired = await Promise.all([randomUUID(), randomUUID()].map((id) => repo.createRoom({ id, kind: 'private', creatorId: bob.id, memberIds: [outsider.id], at: now, name: null })));
  assert.equal(paired[0], paired[1]);
  const ids = Array.from({ length: 65 }, (_, index) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, '0')}`);
  for (const id of ids) await repo.addRoomMessage({ id, roomId, senderId: alice.id, text: id, createdAt: now, deleted: false });
  const newest = await repo.listRoomMessages(roomId, bob.id, 30);
  assert.ok(newest);
  assert.deepEqual(newest.map((item) => item.id), ids.slice(-30));
  const older = await repo.listRoomMessages(roomId, bob.id, 30, { beforeId: newest[0].id });
  assert.ok(older);
  assert.deepEqual(older.map((item) => item.id), ids.slice(5, 35));
  assert.equal(await repo.listRoomMessages(roomId, outsider.id, 30), null);
  const context = await repo.listRoomMessages(roomId, bob.id, 30, { aroundId: ids[10] });
  assert.ok(context);
  assert.equal(context[0]?.id, ids[0]);
  assert.equal(context.at(-1)?.id, ids[29]);
  assert.ok(context.some((item) => item.id === ids[10]));
  const anchorOnly = await repo.listRoomMessages(roomId, bob.id, 1, { aroundId: ids[10] });
  assert.equal(anchorOnly?.[0]?.id, ids[10]);
  const tail = await repo.listRoomMessages(roomId, bob.id, 30, { aroundId: ids[60] });
  assert.equal(tail?.at(-1)?.id, ids.at(-1));
  assert.ok(tail?.some((item) => item.id === ids[60]));
  assert.equal(await repo.changeRoomMessage(roomId, bob.id, ids[0], 'forbidden', now), false);
  assert.equal(await repo.changeRoomMessage(roomId, alice.id, ids[0], 'edited', now), true);
  assert.equal(await repo.markRoomRead(roomId, bob.id, now, ids[10]), true);
  assert.equal((await repo.listHome(bob.id)).find((item) => item.id === roomId)?.unreadCount, 54);
  await repo.markRoomRead(roomId, bob.id, now, ids[0]);
  assert.equal((await repo.listReaders(roomId)).find((item) => item.userId === bob.id)?.messageId, ids[10]);
  assert.equal(await repo.changeRoomMessage(roomId, alice.id, ids[0], null, now), true);
  assert.equal(await repo.changeRoomMessage(roomId, alice.id, ids[0], 'resurrect', now), false);
  for (const id of ids) await repo.setSaved(bob.id, id, true, now);
  const saved = await repo.listSaved(bob.id, 30);
  const savedOlder = await repo.listSaved(bob.id, 30, saved.at(-1)?.messageId);
  assert.equal(saved.length, 30); assert.equal(savedOlder.length, 30);
  assert.equal(savedOlder.some((item) => saved.some((entry) => entry.messageId === item.messageId)), false);
  await repo.createSession(hashSession('bob'), bob.id, new Date(now.getTime() + 60_000));
  const config = loadConfig({ DATABASE_URL: 'postgres://unused' });
  const deps: Deps = { repo, config, now: () => now.getTime(), rateLimit: createLimiter(config, () => now.getTime()) };
  const page = await readRoomMessages(deps, { token: 'bob', roomId });
  assert.equal(page.ok, true);
  assert.equal((await repo.listReaders(roomId)).find((item) => item.userId === bob.id)?.messageId, ids[10]);
  assert.equal((await markRoomSeen(deps, { token: 'bob', roomId, messageId: randomUUID() })).ok, false);
  assert.equal((await changeMessage(deps, { token: 'bob', roomId, messageId: ids[1], text: 'forbidden', deleting: false })).ok, false);
  assert.equal(await repo.updateRoom(GLOBAL_ROOM_ID, alice.id, { name: 'forbidden' }, now), false);
  return { alice, bob, roomId };
}

it('keeps stable pagination, scoped access, monotonic reads and immutable deletion', async () => { await verify(createMemoryRepository()); });
it('persists weekly group rights and rotates only once under concurrent reads', async () => { await verifyGroupRotation(createMemoryRepository()); });
it('notifies every group member once and keeps read status private', async () => { await verifyTurnNotifications(createMemoryRepository()); });
it('preserves newer notifications across delayed mark-all and clear operations', async () => { await verifyNotificationCutoffs(createMemoryRepository()); });

const database = process.env.CHATX_TEST_DATABASE_URL;
it('verifies PostgreSQL migrations, cursor SQL and transaction rollback', { skip: !database }, async () => {
  const address = new URL(database!);
  assert.ok(['127.0.0.1', 'localhost'].includes(address.hostname), 'Tests require a dedicated localhost database');
  const schema = `chatx_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: database });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: database, options: `-c search_path=${schema}` });
  try {
    await migrate(pool);
    const repo = createPostgresRepository(pool);
    const turnNotices = await verifyTurnNotifications(repo);
    // Reproduce the old holder-only inbox, then apply the upgrade backfill twice.
    await pool.query('DELETE FROM notifications WHERE message_id=$1 AND user_id<>$2', [turnNotices.message.id, turnNotices.people[0].id]);
    const turnBackfill = await readFile(new URL('../src/db/020_turn_notifications.sql', import.meta.url), 'utf8');
    await pool.query(turnBackfill); await pool.query(turnBackfill);
    for (const person of turnNotices.people) {
      const notices = (await repo.listNotifications(person.id, 30, null)).filter(notice => notice.messageId === turnNotices.message.id);
      assert.equal(notices.length, 1);
      assert.equal(notices[0].read, person.id === turnNotices.people[0].id);
    }
    await verifyNotificationCutoffs(repo);
    await verifyGroupRotation(repo);
    await verifyLowBandwidth(repo);
    const five = Array.from({ length: 5 }, () => user(randomUUID()));
    await Promise.all(five.map(person => repo.insertUser(person)));
    await repo.createRoom({ id: randomUUID(), kind: 'group', creatorId: five[0].id, memberIds: five.slice(1).map(person => person.id), name: 'Five people', at: now });
    await Promise.all(five.map(async person => {
      assert.equal(await repo.bindGoogleSub(person.id, person.id), true);
      assert.equal((await repo.findUserByGoogleSub(person.id))?.id, person.id);
      await repo.createSession(hashSession(person.id), person.id, new Date(now.getTime() + 60000));
      assert.equal((await repo.findSessionUser(hashSession(person.id), now))?.id, person.id);
      assert.ok((await repo.listHome(person.id, now)).length > 0);
      assert.deepEqual(await repo.listSaved(person.id, 30), []);
    }));
    assert.equal(await repo.bindGoogleSub(five[0].id, five[1].id), false);
    const { alice, bob, roomId } = await verify(repo);
    const message: RoomMessage = { id: randomUUID(), roomId, senderId: alice.id, text: '', createdAt: now, deleted: false };
    await pool.query(`CREATE FUNCTION fail_image() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$`);
    await pool.query('CREATE TRIGGER fail_image BEFORE INSERT ON message_images FOR EACH ROW EXECUTE FUNCTION fail_image()');
    await assert.rejects(repo.addRoomMessage(message, new Uint8Array([255,216,255,0])));
    assert.equal((await pool.query('SELECT id FROM room_messages WHERE id=$1', [message.id])).rowCount, 0);
    await pool.query('DROP TRIGGER fail_image ON message_images');
    await repo.addRoomMessage(message, new Uint8Array([255,216,255,0]));
    await repo.changeRoomMessage(roomId, alice.id, message.id, null, now);
    await repo.addRoomMessage(message, new Uint8Array([255,216,255,0]));
    assert.equal(await repo.readMessageImage(roomId, bob.id, message.id), null);
    assert.equal((await pool.query('SELECT message_id FROM message_images WHERE message_id=$1', [message.id])).rowCount, 0);
    const third = user(randomUUID()); await repo.insertUser(third);
    const group = randomUUID();
    await pool.query(`CREATE FUNCTION fail_member() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$`);
    await pool.query('CREATE TRIGGER fail_member BEFORE INSERT ON room_members FOR EACH ROW EXECUTE FUNCTION fail_member()');
    await assert.rejects(repo.createRoom({ id: group, kind: 'group', creatorId: alice.id, memberIds: [bob.id, third.id], name: 'test', at: now }));
    assert.equal((await pool.query('SELECT id FROM rooms WHERE id=$1', [group])).rowCount, 0);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  }
});
