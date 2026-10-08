import { readFileSync } from 'node:fs';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { TLSSocket } from 'node:tls';
import { createLimiter } from './authService.ts';
import { loadConfig } from './config.ts';
import { createApi } from './http.ts';
import { migrate } from './migrate.ts';
import { createPool, createPostgresRepository } from './postgres.ts';
import { loadThrottle, saveThrottle } from './throttle.ts';

function safeMessage(error: unknown) {
  if (!(error instanceof Error)) return 'startup failed';
  if (error.message.includes('://')) return 'startup failed';
  return error.message;
}

function clientAddress(req: IncomingMessage, trustProxy: boolean) {
  if (trustProxy) {
    const header = req.headers['x-forwarded-for'];
    const value = Array.isArray(header) ? header[0] : header;
    const ip = value?.split(',')[0]?.trim();
    if (ip) return ip.slice(0, 64);
  }
  return req.socket.remoteAddress?.slice(0, 64) || 'local';
}

function bodyLimit(url: string | undefined) {
  const path = url?.split('?')[0] ?? '';
  if (path === '/api/profile') return 280_000;
  if (/^\/api\/rooms\/[0-9a-f-]{36}$/i.test(path)) return 280_000;
  if (/^\/api\/rooms\/[0-9a-f-]{36}\/messages\/[0-9a-f-]{36}$/i.test(path)) return 24_000;
  if (/^\/api\/rooms\/[0-9a-f-]{36}\/messages$/i.test(path)) return 400_000;
  return 4096;
}

async function readBody(req: IncomingMessage) {
  if (req.method === 'GET' || req.method === 'HEAD') return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  const limit = bodyLimit(req.url);
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > limit) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function writeResponse(res: ServerResponse, response: Response, encrypted: boolean) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key === 'set-cookie') return;
    res.setHeader(key, value);
  });
  if (encrypted) res.setHeader('strict-transport-security', 'max-age=86400');
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader('set-cookie', cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}

const config = loadConfig();
const pool = createPool(config.databaseUrl);

try {
  await migrate(pool);
  const repo = createPostgresRepository(pool);
  const throttle = await loadThrottle(pool);
  const handle = createApi({
    repo,
    config,
    now: () => Date.now(),
    rateLimit: createLimiter(config, () => Date.now(), {
      initial: throttle,
      onChange: (state) => saveThrottle(pool, state),
    }),
  });
  const onRequest = async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const body = await readBody(req);
      if (!body) {
        res.statusCode = 400;
        res.end('{"error":"invalid_credentials"}');
        return;
      }
      const headers = new Headers();
      if (req.headers.cookie) headers.set('cookie', req.headers.cookie);
      if (typeof req.headers.origin === 'string') headers.set('origin', req.headers.origin);
      const privateNetwork = req.headers['access-control-request-private-network'];
      if (privateNetwork === 'true') headers.set('access-control-request-private-network', 'true');
      const contentType = req.headers['content-type'];
      if (typeof contentType === 'string') headers.set('content-type', contentType);
      if (req.headers['x-chatx-request'] === '1') headers.set('x-chatx-request', '1');
      headers.set('x-chatx-client', clientAddress(req, config.trustProxy));
      headers.set('x-chatx-secure', (req.socket as TLSSocket).encrypted ? '1' : '0');
      const request = new Request(`http://127.0.0.1${req.url ?? '/'}`, {
        method: req.method,
        headers,
        body: !body.length || req.method === 'GET' || req.method === 'HEAD' ? undefined : body.toString('utf8'),
      });
      await writeResponse(res, await handle(request), Boolean((req.socket as TLSSocket).encrypted));
    } catch {
      if (res.headersSent) return;
      res.statusCode = 500;
      res.end('{"error":"unavailable"}');
    }
  };
  const localServer = createHttpServer(onRequest);
  localServer.listen(config.port, '127.0.0.1');
  const tlsServer = config.tlsCertPath && config.tlsKeyPath
    ? createHttpsServer({ cert: readFileSync(config.tlsCertPath), key: readFileSync(config.tlsKeyPath) }, onRequest)
    : null;
  tlsServer?.listen(config.tlsPort, '0.0.0.0');
  const shutdown = () => {
    localServer.close();
    tlsServer?.close();
    void pool.end();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} catch (error) {
  console.error(safeMessage(error));
  await pool.end();
  process.exit(1);
}
