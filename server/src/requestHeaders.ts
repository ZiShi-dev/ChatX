import type { IncomingHttpHeaders } from 'node:http';

export function clientRequestHeaders(incoming: IncomingHttpHeaders) {
  const headers = new Headers();
  for (const name of ['cookie', 'origin', 'content-type', 'if-none-match', 'accept-encoding']) {
    const value = incoming[name];
    if (typeof value === 'string') headers.set(name, value);
  }
  if (incoming['access-control-request-private-network'] === 'true') headers.set('access-control-request-private-network', 'true');
  if (incoming['x-chatx-request'] === '1') headers.set('x-chatx-request', '1');
  const session = incoming['x-chatx-session'];
  if (typeof session === 'string' && session.length <= 64) headers.set('x-chatx-session', session);
  return headers;
}
