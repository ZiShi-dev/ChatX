import { readFileSync } from 'node:fs';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { TLSSocket } from 'node:tls';
import { createLimiter } from './authService.ts';
import { loadConfig } from './config.ts';
import { createApi, securityHeaders } from './http.ts';
import { configureHttpServer, proxyClientAddress } from './transportSecurity.ts';
import { clientRequestHeaders } from './requestHeaders.ts';
import { migrate } from './migrate.ts';
import { createPool, createPostgresRepository } from './postgres.ts';
import { loadThrottle, saveThrottle } from './throttle.ts';

function safeMessage(error: unknown) {
  if (!(error instanceof Error)) return 'startup failed';
  if (error.message.includes('://')) return 'startup failed';
  return error.message;
}

function externalHttps(req: IncomingMessage, trustProxy: boolean) {
  if ((req.socket as TLSSocket).encrypted) return true;
  if (!trustProxy) return false;
  const forwarded = req.headers['x-forwarded-proto'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(',').at(-1)?.trim() === 'https';
}

function bodyLimit(url: string | undefined) {
  const path = url?.split('?')[0] ?? '';
  if (/^\/api\/rooms\/[0-9a-f-]{36}\/uploads\/[0-9a-f-]{36}$/.test(path)) return 32_768;
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
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > limit) { req.resume(); return null; }
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
  if (encrypted) res.setHeader('strict-transport-security', 'max-age=31536000');
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
        const headers = new Headers();securityHeaders(headers);headers.set('cache-control','no-store');headers.set('content-type','application/json');
        await writeResponse(res,new Response('{"error":"payload_too_large"}',{status:413,headers}),externalHttps(req,config.trustProxy));
        return;
      }
      const headers = clientRequestHeaders(req.headers);
      headers.set('x-chatx-client', proxyClientAddress(req, config.trustProxy));
      headers.set('x-chatx-secure', externalHttps(req, config.trustProxy) ? '1' : '0');
      const request = new Request(`http://127.0.0.1${req.url ?? '/'}`, {
        method: req.method,
        headers,
        body: !body.length || req.method === 'GET' || req.method === 'HEAD' ? undefined : new Uint8Array(body).buffer,
      });
      await writeResponse(res, await handle(request), externalHttps(req,config.trustProxy));
    } catch {
      if (res.headersSent) return;
      const headers = new Headers();
      securityHeaders(headers);
      headers.set('cache-control', 'no-store');
      headers.set('content-type', 'application/json');
      await writeResponse(res, new Response('{"error":"unavailable"}', { status: 500, headers }), externalHttps(req, config.trustProxy));
    }
  };
  const localServer = createHttpServer(onRequest);
  configureHttpServer(localServer);
  const bindHost = process.env.CHATX_BIND === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1';
  localServer.listen(config.port, bindHost);
  const tlsServer = config.tlsCertPath && config.tlsKeyPath
    ? createHttpsServer({ cert: readFileSync(config.tlsCertPath), key: readFileSync(config.tlsKeyPath) }, onRequest)
    : null;
  if(tlsServer)configureHttpServer(tlsServer);
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
