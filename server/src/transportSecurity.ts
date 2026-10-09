import { isIP } from 'node:net';
import type { IncomingMessage, Server } from 'node:http';

export function proxyClientAddress(request:Pick<IncomingMessage,'headers'|'socket'>,trustProxy:boolean) {
  const header=request.headers['x-forwarded-for'];
  // The trusted edge appends the actual client last; ignore attacker-supplied prefixes.
  const candidate=typeof header==='string'?header.split(',').at(-1)?.trim():undefined;
  return trustProxy&&candidate&&isIP(candidate)?candidate:request.socket.remoteAddress||'local';
}
export function configureHttpServer(server:Server) {
  server.requestTimeout=120000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
  server.maxHeadersCount=64;server.maxConnections=100;server.maxRequestsPerSocket=1000;
}
