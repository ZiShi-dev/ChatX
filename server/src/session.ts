import { createHash, randomBytes } from 'node:crypto';

const SESSION_SECONDS = 30 * 24 * 60 * 60;

export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSession(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionCookie(token: string, secure: boolean, maxAge = SESSION_SECONDS) {
  const parts = [`chatx_session=${token}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(secure: boolean) {
  return sessionCookie('', secure, 0);
}

export function readCookie(header: string | null, name: string) {
  if (!header) return '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return '';
}
