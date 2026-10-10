/** WebCrypto primitives for ChatX end-to-end encryption. No state, no network. */
export const SEALED_PREFIX = 'e2e1.';
export const BACKUP_ITERATIONS = 310_000;
export const RECOVERY_CODE_MIN = 12;

const SEALED = /^e2e1\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{22,16340})$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type KeyBackup = { salt: string; iv: string; data: string; iterations: number };
export type Identity = { privateKey: CryptoKey; publicKey: string };

const buffer = (bytes: Uint8Array) => new Uint8Array(bytes).buffer;

export function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string) {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function isSealed(text: string | undefined | null): text is string {
  return typeof text === 'string' && text.startsWith(SEALED_PREFIX);
}

export function sealedKeyId(text: string) {
  return SEALED.exec(text)?.[1] ?? null;
}

const randomBytes = (length: number) => crypto.getRandomValues(new Uint8Array(length));

async function importPrivate(pkcs8: Uint8Array) {
  return crypto.subtle.importKey('pkcs8', buffer(pkcs8), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
}

async function importPublic(raw: string) {
  return crypto.subtle.importKey('raw', buffer(fromBase64Url(raw)), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

async function codeKey(code: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey('raw', buffer(encoder.encode(code.normalize('NFKC'))), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: buffer(salt), iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Creates an identity and its backup. Only the backup ever holds the private key in exportable form. */
export async function createIdentity(code: string): Promise<{ identity: Identity; backup: KeyBackup }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const publicKey = toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  try {
    const backup = await sealBackup(pkcs8, code);
    return { identity: { privateKey: await importPrivate(pkcs8), publicKey }, backup };
  } finally { pkcs8.fill(0); }
}

async function sealBackup(pkcs8: Uint8Array, code: string): Promise<KeyBackup> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await codeKey(code, salt, BACKUP_ITERATIONS);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buffer(iv), additionalData: buffer(encoder.encode('chatx-backup-v1')) }, key, buffer(pkcs8)));
  return { salt: toBase64Url(salt), iv: toBase64Url(iv), data: toBase64Url(data), iterations: BACKUP_ITERATIONS };
}

/** Returns null when the code is wrong (AES-GCM tag mismatch). */
export async function restoreIdentity(backup: KeyBackup, publicKey: string, code: string): Promise<Identity | null> {
  const key = await codeKey(code, fromBase64Url(backup.salt), backup.iterations);
  let pkcs8: Uint8Array;
  try {
    pkcs8 = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buffer(fromBase64Url(backup.iv)), additionalData: buffer(encoder.encode('chatx-backup-v1')) }, key, buffer(fromBase64Url(backup.data))));
  } catch { return null; }
  try { return { privateKey: await importPrivate(pkcs8), publicKey }; } finally { pkcs8.fill(0); }
}

async function pairKey(privateKey: CryptoKey, otherPublic: string, context: string) {
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: await importPublic(otherPublic) }, privateKey, 256);
  const base = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: buffer(encoder.encode(`chatx-room-key-v1|${context}`)) },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

const wrapContext = (roomId: string, keyId: string, memberId: string) => `${roomId}|${keyId}|${memberId}`;

export async function wrapRoomKey(privateKey: CryptoKey, memberPublic: string, raw: Uint8Array, roomId: string, keyId: string, memberId: string) {
  const context = wrapContext(roomId, keyId, memberId);
  const key = await pairKey(privateKey, memberPublic, context);
  const iv = randomBytes(12);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buffer(iv), additionalData: buffer(encoder.encode(context)) }, key, buffer(raw)));
  const out = new Uint8Array(12 + sealed.length);
  out.set(iv); out.set(sealed, 12);
  return toBase64Url(out);
}

export async function unwrapRoomKey(privateKey: CryptoKey, wrapperPublic: string, wrapped: string, roomId: string, keyId: string, memberId: string) {
  const context = wrapContext(roomId, keyId, memberId);
  const key = await pairKey(privateKey, wrapperPublic, context);
  const bytes = fromBase64Url(wrapped);
  const raw = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buffer(bytes.subarray(0, 12)), additionalData: buffer(encoder.encode(context)) }, key, buffer(bytes.subarray(12))));
  if (raw.length !== 32) throw new Error('invalid_room_key');
  return raw;
}

export function newRoomKey() {
  return randomBytes(32);
}

export function importRoomKey(raw: Uint8Array) {
  return crypto.subtle.importKey('raw', buffer(raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function sealText(key: CryptoKey, keyId: string, aad: string, text: string) {
  const iv = randomBytes(12);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buffer(iv), additionalData: buffer(encoder.encode(aad)) }, key, buffer(encoder.encode(text))));
  return `${SEALED_PREFIX}${keyId}.${toBase64Url(iv)}.${toBase64Url(data)}`;
}

export async function openText(key: CryptoKey, envelope: string, aad: string) {
  const match = SEALED.exec(envelope);
  if (!match) throw new Error('invalid_envelope');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buffer(fromBase64Url(match[2]!)), additionalData: buffer(encoder.encode(aad)) }, key, buffer(fromBase64Url(match[3]!)));
  return decoder.decode(plain);
}

/** Output is iv(12) || ciphertext+tag, 28 bytes longer than the input. */
export async function sealBytes(key: CryptoKey, aad: string, bytes: Uint8Array) {
  const iv = randomBytes(12);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buffer(iv), additionalData: buffer(encoder.encode(aad)) }, key, buffer(bytes)));
  const out = new Uint8Array(12 + data.length);
  out.set(iv); out.set(data, 12);
  return out;
}

export async function openBytes(key: CryptoKey, aad: string, bytes: Uint8Array) {
  if (bytes.length < 28) throw new Error('invalid_media');
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buffer(bytes.subarray(0, 12)), additionalData: buffer(encoder.encode(aad)) }, key, buffer(bytes.subarray(12))));
}
