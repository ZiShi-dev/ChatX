import { createPublicKey, verify, type KeyObject } from 'node:crypto';

export type GoogleIdentity = {
  sub: string;
  email: string;
  name: string;
  picture: string;
};

type Jwk = { kid?: unknown; kty?: unknown; alg?: unknown; n?: unknown; e?: unknown };

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
let cachedKeys: { expiresAt: number; keys: Map<string, KeyObject> } | null = null;
let pendingKeys:Promise<Map<string,KeyObject>> | null = null;

function jsonPart(part: string): unknown {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function audienceMatches(value: unknown, clientId: string) {
  if (typeof value === 'string') return value === clientId;
  return Array.isArray(value) && value.some((item) => item === clientId);
}

export function readGoogleIdentity(claims: unknown, clientId: string, now: number): GoogleIdentity | null {
  if (!claims || typeof claims !== 'object' || !clientId) return null;
  const data = claims as Record<string, unknown>;
  const email = text(data.email).toLowerCase();
  const sub = text(data.sub);
  const expiresAt = typeof data.exp === 'number' ? data.exp * 1000 : 0;
  const emailVerified = data.email_verified === true || data.email_verified === 'true';
  if (!ISSUERS.has(text(data.iss)) || !audienceMatches(data.aud, clientId)) return null;
  if (!emailVerified || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 || !sub || sub.length>255 || !Number.isFinite(expiresAt) || expiresAt <= now) return null;
  if(data.azp!==undefined && data.azp!==clientId)return null;
  if(Array.isArray(data.aud) && data.aud.length>1 && data.azp!==clientId)return null;
  if(data.iat!==undefined && (typeof data.iat!=='number' || !Number.isFinite(data.iat) || data.iat*1000>now+60000))return null;
  if(data.nbf!==undefined && (typeof data.nbf!=='number' || !Number.isFinite(data.nbf) || data.nbf*1000>now+60000))return null;
  const name = text(data.name).replace(/[\u0000-\u001f]/g, '').slice(0, 40);
  const picture = text(data.picture);
  return {
    sub,
    email,
    name,
    picture: picture.startsWith('https://') ? picture : '',
  };
}

async function googleKeys(now: number) {
  if (cachedKeys && cachedKeys.expiresAt > now) return cachedKeys.keys;
  if(pendingKeys)return pendingKeys;
  pendingKeys=fetchGoogleKeys(now).finally(()=>{pendingKeys=null;});
  return pendingKeys;
}
async function fetchGoogleKeys(now:number) {
  const response = await fetch(CERTS_URL,{signal:AbortSignal.timeout(5000)});
  if (!response.ok) throw new Error('google certs unavailable');
  const payload: unknown = await response.json();
  const keys = new Map<string, KeyObject>();
  const listed = payload && typeof payload === 'object' ? (payload as { keys?: unknown }).keys : null;
  if (!Array.isArray(listed)) throw new Error('google certs unavailable');
  for (const item of listed) {
    if (!item || typeof item !== 'object') continue;
    const jwk = item as Jwk;
    if (jwk.kty !== 'RSA' || jwk.alg !== 'RS256' || typeof jwk.kid !== 'string' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') continue;
    keys.set(jwk.kid, createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256' }, format: 'jwk' }));
  }
  if (!keys.size) throw new Error('google certs unavailable');
  cachedKeys = { expiresAt: now + 60 * 60 * 1000, keys };
  return keys;
}

export async function verifyGoogleIdToken(token: string, clientId: string, now = Date.now()) {
  const parts = token.split('.');
  if (parts.length !== 3 || token.length > 4096 || !clientId) return null;
  const [headerPart, payloadPart, signaturePart] = parts;
  if (!headerPart || !payloadPart || !signaturePart) return null;
  let header: unknown;
  let claims: unknown;
  try {
    header = jsonPart(headerPart);
    claims = jsonPart(payloadPart);
  } catch {
    return null;
  }
  const kid = header && typeof header === 'object' ? text((header as { kid?: unknown }).kid) : '';
  const alg = header && typeof header === 'object' ? text((header as { alg?: unknown }).alg) : '';
  if (alg !== 'RS256' || !kid) return null;
  const key = (await googleKeys(now)).get(kid);
  if (!key) return null;
  const valid = verify('RSA-SHA256', Buffer.from(`${headerPart}.${payloadPart}`), key, Buffer.from(signaturePart, 'base64url'));
  if (!valid) return null;
  return readGoogleIdentity(claims, clientId, now);
}
