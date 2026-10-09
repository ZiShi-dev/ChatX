import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { it } from 'node:test';
import { createApi } from '../src/http.ts';
import { createMemoryRepository } from '../src/memory.ts';
import { createLimiter } from '../src/authService.ts';
import { loadConfig } from '../src/config.ts';
import { clientRequestHeaders } from '../src/requestHeaders.ts';

it('preserves conditional validation through the real HTTP header adapter', async () => {
  const config = loadConfig({ DATABASE_URL: 'postgres://unused' });
  const handle = createApi({ repo: createMemoryRepository(), config, now: () => Date.now(), rateLimit: createLimiter(config, () => Date.now()) });
  const server = createServer(async (incoming, outgoing) => {
    const response = await handle(new Request(`http://localhost${incoming.url}`, { headers: clientRequestHeaders(incoming.headers) }));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const first = await fetch(`${base}/api/health`);
    const etag = first.headers.get('etag');
    assert.ok(etag);
    assert.equal(first.status, 200);
    const same = await fetch(`${base}/api/health`, { headers: { 'if-none-match': etag } });
    assert.equal(same.status, 304);
    assert.equal((await same.arrayBuffer()).byteLength, 0);
    const denied = await fetch(`${base}/api/home`, { headers: { 'if-none-match': etag } });
    assert.equal(denied.status, 401);
    const spoofed = clientRequestHeaders({ 'x-chatx-secure': '1', 'x-chatx-client': 'trusted' });
    assert.equal(spoofed.has('x-chatx-secure'), false);
    assert.equal(spoofed.has('x-chatx-client'), false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
