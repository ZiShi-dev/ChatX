import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createApi } from '../src/http.ts';
import { createLimiter } from '../src/authService.ts';
import { loadConfig } from '../src/config.ts';
import { hashSession } from '../src/session.ts';
import type { AuthRepository, AuthUser } from '../src/types.ts';
import { jpegBytes } from './jpegFixture.ts';

export async function verifyLowBandwidth(repo: AuthRepository) {
  let now = Date.parse('2026-10-09T12:00:00Z');
  const makeUser = (): AuthUser => { const id = randomUUID(); return { id, email: `${id}@test.invalid`, username: `u${id.slice(0,8)}`, displayName: id, role: 'member', bio: '', avatarUrl: null, bannerUrl: null }; };
  const alice = makeUser(), bob = makeUser(), stranger = makeUser();
  for (const user of [alice, bob, stranger]) { await repo.insertUser(user); await repo.ensureHome(user.id); await repo.createSession(hashSession(user.id), user.id, new Date(now + 2 * 86_400_000)); }
  const roomId = randomUUID();
  await repo.createRoom({ id: roomId, kind: 'private', name: null, creatorId: alice.id, memberIds: [bob.id], at: new Date(now) });
  const config = loadConfig({ DATABASE_URL: 'postgres://unused' });
  const api = createApi({ repo, config, now: () => now, rateLimit: createLimiter(config, () => now) });
  const request = (path: string, method = 'GET', body?: unknown, owner = alice.id) => api(new Request(`http://localhost/api/rooms/${roomId}${path}`, {
    method, headers: { cookie: `chatx_session=${owner}`, 'x-chatx-request': '1', 'content-type': body instanceof Uint8Array ? 'application/octet-stream' : 'application/json' },
    body: body instanceof Uint8Array ? new Uint8Array(body).buffer : body === undefined ? undefined : JSON.stringify(body),
  }));
  const ids: string[] = [];
  for (let i = 0; i < 35; i++) { const id = randomUUID(); ids.push(id); await repo.addRoomMessage({ id, roomId, senderId: alice.id, text: `message ${i}`, createdAt: new Date(now + i), deleted: false }); }
  const first = await (await request('/sync')).json();
  assert.equal(first.reset, true); assert.equal(first.messages.length, 30); assert.equal(first.historyHasMore, true);
  const unchanged = await (await request(`/sync?cursor=${first.cursor}`)).json();
  assert.deepEqual(unchanged.messages, []); assert.deepEqual(unchanged.readers, []); assert.equal(unchanged.reset, false);
  const liveId = randomUUID();
  const held = request(`/sync?cursor=${unchanged.cursor}&wait=1`);
  const posted = await request('/messages', 'POST', { id: liveId, text: 'arrived live' });
  assert.equal(posted.status, 200);
  const live = await (await held).json();
  assert.equal(live.reset, false);
  assert.equal(live.messages.some((message: { id: string; text: string }) => message.id === liveId && message.text === 'arrived live'), true);
  await repo.changeRoomMessage(roomId, alice.id, ids[0]!, 'old message edited', new Date(now));
  await repo.changeRoomMessage(roomId, alice.id, ids[1]!, null, new Date(now));
  await repo.setReaction({ roomId, userId: bob.id, messageId: ids[2]!, emoji: '👍', at: new Date(now) });
  await repo.markRoomRead(roomId, bob.id, new Date(now), ids[3]!);
  const delta = await (await request(`/sync?cursor=${first.cursor}`)).json();
  assert.equal(delta.reset, false); assert.equal(delta.messages.find((m: {id:string}) => m.id === ids[0]).text, 'old message edited');
  assert.equal(delta.messages.find((m: {id:string}) => m.id === ids[1]).deleted, true);
  assert.equal(delta.messages.find((m: {id:string}) => m.id === ids[2]).reactions[0].emoji, '👍');
  assert.equal(delta.readers[0].userId, bob.id);
  assert.equal((await request(`/sync?cursor=${first.cursor}`, 'GET', undefined, stranger.id)).status, 404);
  const reset = await (await request('/sync?cursor=00000000-0000-0000-0000-000000000001.999999')).json(); assert.equal(reset.reset, true);
  for (let i=0; i<65; i++) await repo.addRoomMessage({id:randomUUID(), roomId, senderId:alice.id, text:'backlog',createdAt:new Date(now+i+100), deleted:false});
  const backlog = await (await request(`/sync?cursor=${delta.cursor}`)).json(); assert.equal(backlog.hasMore,true);
  const rest = await (await request(`/sync?cursor=${backlog.cursor}`)).json(); assert.equal(rest.hasMore,false);
  assert.equal(new Set([...backlog.messages,...rest.messages].map((m:{id:string})=>m.id)).size,65);
  // Binary payload contains invalid UTF-8 to catch accidental string conversion in transport.
  const bytes = new Uint8Array([0,255,128,1,254,64,13,10]);
  const id = randomUUID(); const path = `/uploads/${id}`;
  const init = { kind: 'file', name: 'test.bin', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  assert.equal((await request(path, 'POST', init, stranger.id)).status, 404);
  assert.equal((await (await request(path, 'POST', init)).json()).offset,0);
  const parallel = await Promise.all([request(`${path}?offset=0`,'PATCH',bytes.slice(0,3)), request(`${path}?offset=0`,'PATCH',bytes.slice(0,3))]);
  assert.deepEqual(parallel.map((r)=>r.status).sort(),[200,409]);
  assert.equal((await (await request(path,'POST',init)).json()).offset,3);
  assert.equal((await request(`${path}/complete`,'POST',{})).status,400);
  assert.equal((await request(`${path}?offset=3`,'PATCH',bytes.slice(3))).status,200);
  const completed = await (await request(`${path}/complete`,'POST',{})).json(); assert.equal(completed.completed,true);
  // The first confirmation can be lost; repeating completion does not insert a second message.
  const repeated = await (await request(`${path}/complete`,'POST',{})).json(); assert.equal(repeated.message.id,id);
  assert.equal((await (await request(path,'POST',init)).json()).completed,true);
  assert.deepEqual([...((await repo.readMessageFile(roomId,bob.id,id))?.bytes ?? [])],[...bytes]);
  assert.equal((await repo.listRoomMessages(roomId,alice.id,300))?.filter((m)=>m.id===id).length,1);
  const corrupt = randomUUID(); await request(`/uploads/${corrupt}`,'POST',{...init,sha256:'0'.repeat(64)});
  await request(`/uploads/${corrupt}?offset=0`,'PATCH',bytes);
  assert.equal((await request(`/uploads/${corrupt}/complete`,'POST',{})).status,400);
  const imageId = randomUUID();
  const imagePath = `/uploads/${imageId}`;
  const imageInit = { kind: 'image', name: 'photo.jpg', size: jpegBytes.length, sha256: createHash('sha256').update(jpegBytes).digest('hex') };
  assert.equal((await request(imagePath, 'POST', imageInit)).status, 200);
  assert.equal((await request(`${imagePath}?offset=0`, 'PATCH', new Uint8Array(jpegBytes))).status, 200);
  const imageComplete = await request(`${imagePath}/complete`, 'POST', {});
  assert.equal(imageComplete.status, 200);
  assert.equal((await imageComplete.json()).message.type, 'image');
  const imageDownload = await request(`/messages/${imageId}/image`, 'GET', undefined, bob.id);
  assert.equal(imageDownload.status, 200);
  assert.equal(imageDownload.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await imageDownload.arrayBuffer()), jpegBytes);
  assert.equal((await request(`/messages/${imageId}/image`, 'GET', undefined, stranger.id)).status, 404);
  const expired = randomUUID(); await request(`/uploads/${expired}`,'POST',init);
  now += 86_400_001;
  assert.equal((await request(`/uploads/${expired}?offset=0`,'PATCH',bytes)).status,404);
  assert.equal((await (await request(`/uploads/${expired}`,'POST',init)).json()).offset,0);
  assert.equal((await request(`/uploads/${expired}?offset=0`,'PATCH',new Uint8Array(32769))).status,400);
}
