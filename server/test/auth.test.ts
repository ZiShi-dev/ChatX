import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLimiter, type Deps } from '../src/authService.ts';
import { loadConfig } from '../src/config.ts';
import { createApi } from '../src/http.ts';
import { createMemoryRepository } from '../src/memory.ts';

function testDeps(): Deps {
  return {
    repo: createMemoryRepository(),
    config: loadConfig({ DATABASE_URL: 'postgres://unused', GOOGLE_CLIENT_ID: '' }),
    now: () => Date.parse('2026-10-08T12:00:00.000Z'),
    rateLimit: createLimiter(loadConfig({ DATABASE_URL: 'postgres://unused' }), () => Date.parse('2026-10-08T12:00:00.000Z')),
  };
}

describe('API without administration', () => {
  it('starts without an owner account', () => {
    const config = loadConfig({ DATABASE_URL: 'postgres://chatx:chatx@127.0.0.1:5432/chatx' });
    assert.equal(config.googleClientId, null);
    assert.equal('ownerEmail' in config, false);
  });

  it('keeps health and refuses administration and invite routes', async () => {
    const handle = createApi(testDeps());
    const health = await handle(new Request('http://127.0.0.1/api/health'));
    assert.equal(health.status, 200);
    assert.equal((await health.json() as { groupTurnPolicy: string }).groupTurnPolicy, 'weekly-v2');
    for (const path of ['/api/admin/auth/login', '/api/admin/users', '/api/admin/invites', '/api/invites/lookup', '/api/invites/login']) {
      const response = await handle(new Request(`http://127.0.0.1${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-chatx-request': '1' },
        body: '{}',
      }));
      assert.equal(response.status, 404);
    }
  });
});
