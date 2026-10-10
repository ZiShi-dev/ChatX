import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { createLimiter } from '../src/authService.ts';
import { loadConfig } from '../src/config.ts';
import { createApi } from '../src/http.ts';
import { createMemoryRepository } from '../src/memory.ts';
import { hashSession } from '../src/session.ts';
import type { AuthUser } from '../src/types.ts';

const now = Date.parse('2026-10-10T12:00:00Z');
const b64 = (length: number, char = 'A') => char.repeat(length);
const backup = { salt: b64(22), iv: b64(16), data: b64(64), iterations: 600_000 };
const sealed = (keyId: string, body = b64(40, 'Q')) => `e2e1.${keyId}.${b64(16, 'B')}.${body}`;

async function setup() {
  const repo = createMemoryRepository();
  const makeUser = (name: string): AuthUser => { const id = randomUUID(); return { id, email: `${id}@test.invalid`, username: name, displayName: name, role: 'member', bio: '', avatarUrl: null, bannerUrl: null }; };
  const alice = makeUser('alice'), bob = makeUser('bob'), stranger = makeUser('stranger');
  for (const user of [alice, bob, stranger]) { await repo.insertUser(user); await repo.createSession(hashSession(user.id), user.id, new Date(now + 86_400_000)); }
  const roomId = randomUUID();
  await repo.createRoom({ id: roomId, kind: 'private', name: null, creatorId: alice.id, memberIds: [bob.id], at: new Date(now) });
  const config = loadConfig({ DATABASE_URL: 'postgres://unused' });
  const api = createApi({ repo, config, now: () => now, rateLimit: createLimiter(config, () => now) });
  const call = (path: string, method = 'GET', body?: unknown, owner = alice.id) => api(new Request(`http://localhost/api${path}`, {
    method, headers: { cookie: `chatx_session=${owner}`, 'x-chatx-request': '1', 'content-type': body instanceof Uint8Array ? 'application/octet-stream' : 'application/json' },
    body: body instanceof Uint8Array ? new Uint8Array(body).buffer : body === undefined ? undefined : JSON.stringify(body),
  }));
  return { alice, bob, stranger, roomId, call };
}

describe('end-to-end keys', () => {
  it('stores one identity per user and refuses silent replacement', async () => {
    const { call } = await setup();
    assert.deepEqual(await (await call('/keys')).json(), { publicKey: null, backup: null });
    assert.equal((await call('/keys', 'POST', { publicKey: b64(87), backup: { ...backup, iterations: 10 } })).status, 400);
    assert.equal((await call('/keys', 'POST', { publicKey: b64(87), backup })).status, 200);
    assert.equal((await call('/keys', 'POST', { publicKey: b64(87, 'B'), backup })).status, 409);
    assert.equal((await call('/keys', 'POST', { publicKey: b64(87), backup: { ...backup, data: b64(64, 'C') } })).status, 200);
    const stored = await (await call('/keys')).json();
    assert.equal(stored.publicKey, b64(87));
    assert.equal(stored.backup.data, b64(64, 'C'));
    assert.equal((await call('/keys', 'POST', { publicKey: b64(87, 'B'), backup, reset: true })).status, 200);
  });

  it('lets members exchange wrapped room keys and blocks outsiders', async () => {
    const { alice, bob, stranger, roomId, call } = await setup();
    const keyId = randomUUID();
    const wraps = [{ keyId, memberId: alice.id, wrapped: b64(60) }, { keyId, memberId: bob.id, wrapped: b64(60, 'B') }];
    assert.equal((await call(`/rooms/${roomId}/keys`, 'POST', { wraps })).status, 400);
    await call('/keys', 'POST', { publicKey: b64(87), backup });
    assert.equal((await call(`/rooms/${roomId}/keys`, 'POST', { wraps: [{ ...wraps[0]!, memberId: stranger.id }] })).status, 400);
    assert.equal((await call(`/rooms/${roomId}/keys`, 'POST', { wraps })).status, 400);
    await call('/keys', 'POST', { publicKey: b64(87, 'C'), backup }, bob.id);
    assert.equal((await call(`/rooms/${roomId}/keys`, 'POST', { wraps })).status, 200);
    const seen = await (await call(`/rooms/${roomId}/keys`, 'GET', undefined, bob.id)).json();
    assert.deepEqual(seen.mine, [{ keyId, wrapperPublic: b64(87), wrapped: b64(60, 'B') }]);
    assert.deepEqual(seen.keys[0].memberIds, [alice.id, bob.id].sort());
    assert.equal((await call(`/rooms/${roomId}/keys`, 'GET', undefined, stranger.id)).status, 404);
    await call('/keys', 'POST', { publicKey: b64(87, 'D'), backup, reset: true }, bob.id);
    assert.deepEqual((await (await call(`/rooms/${roomId}/keys`, 'GET', undefined, bob.id)).json()).mine, []);
    assert.equal((await call(`/rooms/${roomId}/keys`, 'POST', { wraps: [{ keyId, memberId: bob.id, wrapped: b64(60, 'Z') }] }, bob.id)).status, 400);
  });

  it('accepts sealed text with hints and hides it from notification previews', async () => {
    const { bob, roomId, call } = await setup();
    const keyId = randomUUID();
    const text = sealed(keyId);
    assert.equal((await call(`/rooms/${roomId}/messages`, 'POST', { id: randomUUID(), text: 'e2e1.broken' })).status, 401);
    const id = randomUUID();
    const sent = await call(`/rooms/${roomId}/messages`, 'POST', { id, text, hints: { mentions: [bob.id], everyone: false, signal: false } });
    assert.equal(sent.status, 200);
    assert.equal((await sent.json()).message.text, text);
    const inbox = await (await call('/notifications', 'GET', undefined, bob.id)).json();
    assert.equal(inbox.notifications[0].kind, 'mention');
    assert.equal(inbox.notifications[0].preview, 'رسالة جديدة');
    assert.equal(inbox.notifications[0].sealed, text);
  });

  it('stores sealed media bytes without inspecting them', async () => {
    const { roomId, call } = await setup();
    const bytes = new Uint8Array(100).map((_, index) => index * 7);
    const id = randomUUID();
    const body = sealed(randomUUID(), b64(30));
    const init = { kind: 'image', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), sealed: body };
    assert.equal((await (await call(`/rooms/${roomId}/uploads/${id}`, 'POST', init)).json()).offset, 0);
    assert.equal((await call(`/rooms/${roomId}/uploads/${id}?offset=0`, 'PATCH', bytes)).status, 200);
    const done = await (await call(`/rooms/${roomId}/uploads/${id}/complete`, 'POST', {})).json();
    assert.equal(done.message.text, body);
    const image = await call(`/rooms/${roomId}/messages/${id}/image`);
    assert.equal(image.status, 200);
    assert.deepEqual(new Uint8Array(await image.arrayBuffer()), bytes);
    const plain = await call(`/rooms/${roomId}/uploads/${randomUUID()}`, 'POST', { ...init, sealed: undefined, kind: 'file', name: 'a.txt', size: 262_150 });
    assert.equal(plain.status, 400);
  });
});
