import type { IncomingHttpHeaders } from 'node:http';

export function clientRequestHeaders(incoming: IncomingHttpHeaders) {
  const headers = new Headers();
  for (const name of ['cookie', 'origin', 'content-type', 'if-none-match']) {
    const value = incoming[name];
    if (typeof value === 'string') headers.set(name, value);
  }
  if (incoming['access-control-request-private-network'] === 'true') headers.set('access-control-request-private-network', 'true');
  if (incoming['x-chatx-request'] === '1') headers.set('x-chatx-request', '1');
  return headers;
}
