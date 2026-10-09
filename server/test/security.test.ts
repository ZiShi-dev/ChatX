import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { it } from 'node:test';
import { createLimiter, resumeMember } from '../src/authService.ts';
import { loadConfig } from '../src/config.ts';
import { createApi } from '../src/http.ts';
import { safeJpeg } from '../src/jpeg.ts';
import { createMemoryRepository } from '../src/memory.ts';
import { createRequestBudget } from '../src/requestBudget.ts';
import { createRateLimiter } from '../src/rateLimit.ts';
import { hashSession } from '../src/session.ts';
import { configureHttpServer, proxyClientAddress } from '../src/transportSecurity.ts';
import { readGoogleIdentity } from '../src/google.ts';
import { jpegBytes } from './jpegFixture.ts';

const at = Date.parse('2026-10-09T12:00:00Z');
it('allows native and configured origins, rejects foreign writes and production LAN origins', async () => {
  const config = loadConfig({ DATABASE_URL: 'postgres://unused', NODE_ENV: 'production', CHATX_CORS_ORIGIN: 'https://chat.example' });
  const handle = createApi({ config, repo: createMemoryRepository(), now: () => at, rateLimit: createLimiter(config, () => at) });
  for (const origin of ['https://localhost', 'https://chat.example']) {
    const response = await handle(new Request('http://local/api/health', { headers: { origin } }));
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }
  for (const origin of ['http://192.168.1.1:8100', 'https://evil.example']) {
    const response = await handle(new Request('http://local/api/profile', { method: 'PATCH', headers: { origin, 'x-chatx-request': '1' }, body: '{}' }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  assert.equal((await handle(new Request('http://local/api/profile', { method: 'PATCH', body: '{}' }))).status, 403);
  assert.throws(() => loadConfig({ DATABASE_URL: 'x', NODE_ENV: 'production', CHATX_CORS_ORIGIN: 'http://public.example' }));
});

it('limits bursts with Retry-After and accepts five users sharing the same connection', async () => {
  let clock = at;
  const budget = createRequestBudget(() => clock);
  for (let user = 0; user < 5; user++) for (let index = 0; index < 150; index++) {
    assert.equal(budget(new Request('http://local/api/presence', { method: 'POST', headers: { cookie: `chatx_session=user-${user}` } }), 'shared-ip'), 0);
  }
  const config = loadConfig({ DATABASE_URL: 'unused' });
  const handle = createApi({ config, repo: createMemoryRepository(), now: () => clock, rateLimit: createLimiter(config, () => clock) });
  for (let index = 0; index < 1200; index++) assert.equal((await handle(new Request('http://local/api/health'))).status, 200);
  const rejected = await handle(new Request('http://local/api/health'));
  assert.equal(rejected.status, 429); assert.equal(rejected.headers.get('retry-after'), '60');
  clock += 60000;
  assert.equal((await handle(new Request('http://local/api/health'))).status, 200);
});

it('binds legacy accounts to stable Google subjects and refuses an identity collision', async () => {
  const config = loadConfig({ DATABASE_URL: 'unused' });
  const repo = createMemoryRepository();
  const deps = { config, repo, now: () => at, rateLimit: createLimiter(config, () => at) };
  const id = randomUUID();
  await repo.insertUser({ id, email: 'member@example.com', displayName: 'Member', username: 'Member', role: 'member', bio: '', avatarUrl: null, bannerUrl: null });
  assert.equal((await resumeMember(deps, 'member@example.com', 'google-1')).ok, true);
  assert.equal((await resumeMember(deps, 'changed@example.com', 'google-1')).ok, true);
  assert.deepEqual(await resumeMember(deps, 'member@example.com', 'google-2'), { ok: false, error: 'forbidden' });
  const base = { iss: 'https://accounts.google.com', aud: 'client', exp: at / 1000 + 60, sub: 'sub', email: 'a@b.com', email_verified: true };
  for (const bad of [{ azp: 'foreign' }, { iat: at / 1000 + 3600 }, { nbf: at / 1000 + 3600 }, { aud: ['client', 'other'] }]) assert.equal(readGoogleIdentity({ ...base, ...bad }, 'client', at), null);
});

it('rejects malformed JPEGs and huge decoded dimensions', () => {
  assert.equal(safeJpeg(jpegBytes), true);
  assert.equal(safeJpeg(Buffer.from([255, 216, 255, 217])), false);
  assert.equal(safeJpeg(jpegBytes.subarray(0, 100)), false);
  const huge = Buffer.from(jpegBytes);
  const frame = huge.indexOf(Buffer.from([255, 192]));
  assert.ok(frame > 0);
  huge.writeUInt16BE(65535, frame + 5);
  assert.equal(safeJpeg(huge), false);
});

it('bounds failure tracking and discards expired entries', () => {
  let clock = at; let size = 0;
  const limiter = createRateLimiter({ limit: 5, windowMs: 60000, cooldownMs: 30000, now: () => clock, onChange: state => { size = Object.keys(state.failures).length; } });
  for (let index = 0; index < 2200; index++) limiter.fail(String(index));
  assert.equal(size, 2048);
  clock += 60001; limiter.fail('new'); assert.equal(size, 1);
});

it('ignores spoofed proxy prefixes and sets finite HTTP resource limits', () => {
  const request = { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(proxyClientAddress(request as never, true), '5.6.7.8');
  assert.equal(proxyClientAddress(request as never, false), '127.0.0.1');
  const server = createServer(); configureHttpServer(server);
  assert.equal(server.requestTimeout, 120000); assert.equal(server.headersTimeout, 10000); assert.equal(server.maxConnections, 100);
});

it('runs five concurrent sessions and revokes access after logout', async () => {
  const config = loadConfig({ DATABASE_URL: 'unused' }); const repo = createMemoryRepository();
  const handle = createApi({ config, repo, now: () => at, rateLimit: createLimiter(config, () => at) });
  const tokens = Array.from({ length: 5 }, (_, index) => `five-${index}`);
  await Promise.all(tokens.map(async (token) => {
    const id = randomUUID();
    await repo.insertUser({ id, email: `${id}@example.com`, displayName: id, username: id, role: 'member', bio: '', avatarUrl: null, bannerUrl: null });
    await repo.createSession(hashSession(token), id, new Date(at + 60000));
  }));
  const responses = await Promise.all(tokens.map(token => handle(new Request('http://local/api/home', { headers: { cookie: `chatx_session=${token}` } }))));
  assert.ok(responses.every(response => response.status === 200));
  assert.equal((await handle(new Request('http://local/api/home'))).status, 401);
  for (const token of tokens) await repo.deleteSession(hashSession(token));
  assert.equal((await handle(new Request('http://local/api/home', { headers: { cookie: `chatx_session=${tokens[0]}` } }))).status, 401);
});
