import { adminFetch, AdminApiError } from './adminApi';
import {
  createIdentity, importRoomKey, isSealed, newRoomKey, openBytes, openText, restoreIdentity, sealBytes, sealedKeyId, sealText, toBase64Url,
  unwrapRoomKey, wrapRoomKey, type Identity, type KeyBackup,
} from './e2eCrypto';
import { firstUrl, linkDraft } from './link';
import type { Message } from '../types/message';

export const LOCKED_TEXT = '🔒 تعذر فتح هذه الرسالة على هذا الجهاز';
export type KeySetup = 'ready' | 'restore' | 'create';

const ROOM_INFO_TTL_MS = 10 * 60_000;
const UNKNOWN_KEY_RETRY_MS = 20_000;
const WRAPS_PER_REQUEST = 100;

type RoomKey = { raw: Uint8Array; key: CryptoKey };
type RoomInfo = { at: number; members: Array<{ id: string; publicKey: string | null }>; keys: Array<{ keyId: string; createdAt: string; memberIds: string[] }> };

const identities = new Map<string, Identity>();
const roomKeys = new Map<string, Map<string, RoomKey>>();
const roomInfo = new Map<string, RoomInfo>();
const roomLoads = new Map<string, Promise<RoomInfo>>();
const unknownTried = new Map<string, number>();

let database: Promise<IDBDatabase> | undefined;
function open() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('storage_unavailable')); return; }
    const request = indexedDB.open('chatx-keys-v1', 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('keys')) request.result.createObjectStore('keys', { keyPath: 'key' }); };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = undefined; }; resolve(request.result); };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error('storage_blocked')); };
  });
  return database;
}

async function store<T>(mode: IDBTransactionMode, operation: (table: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction('keys', mode);
    const request = operation(tx.objectStore('keys'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('storage_failed'));
  });
}

const prefix = (owner: string, roomId: string) => `room:${owner}:${roomId}:`;
const roomSlot = (owner: string, roomId: string) => `${owner}:${roomId}`;

async function saveIdentity(owner: string, identity: Identity) {
  identities.set(owner, identity);
  await store('readwrite', (table) => table.put({ key: `id:${owner}`, privateKey: identity.privateKey, publicKey: identity.publicKey })).catch(() => undefined);
}

async function forgetLocal(owner: string) {
  identities.delete(owner);
  for (const slot of [...roomKeys.keys()]) if (slot.startsWith(`${owner}:`)) { roomKeys.delete(slot); roomInfo.delete(slot); }
  await store('readwrite', (table) => table.delete(IDBKeyRange.bound(`room:${owner}:`, `room:${owner}:\uffff`))).catch(() => undefined);
  await store('readwrite', (table) => table.delete(`id:${owner}`)).catch(() => undefined);
}

export async function localIdentity(owner: string) {
  const known = identities.get(owner);
  if (known) return known;
  const row = await store('readonly', (table) => table.get(`id:${owner}`)).catch(() => undefined) as { privateKey?: CryptoKey; publicKey?: string } | undefined;
  if (!row?.privateKey || typeof row.publicKey !== 'string') return null;
  const identity = { privateKey: row.privateKey, publicKey: row.publicKey };
  identities.set(owner, identity);
  return identity;
}

function readServerKeys(payload: unknown): { publicKey: string | null; backup: KeyBackup | null } {
  const row = payload as { publicKey?: unknown; backup?: unknown } | null;
  const backup = row?.backup as Partial<KeyBackup> | null | undefined;
  const validBackup = backup && typeof backup.salt === 'string' && typeof backup.iv === 'string' && typeof backup.data === 'string' && typeof backup.iterations === 'number'
    ? backup as KeyBackup : null;
  return { publicKey: typeof row?.publicKey === 'string' ? row.publicKey : null, backup: validBackup };
}

/** Offline with a local key counts as ready; offline without one rethrows so the screen can offer a retry. */
export async function keySetupState(owner: string): Promise<KeySetup> {
  const local = await localIdentity(owner);
  let server: ReturnType<typeof readServerKeys>;
  try { server = readServerKeys(await adminFetch('/api/keys')); } catch (error) {
    if (local) return 'ready';
    throw error;
  }
  if (local && server.publicKey === local.publicKey) return 'ready';
  if (local) await forgetLocal(owner);
  return server.publicKey && server.backup ? 'restore' : 'create';
}

export async function createKeys(owner: string, code: string, reset = false): Promise<'ok' | 'exists'> {
  const { identity, backup } = await createIdentity(code);
  try {
    await adminFetch('/api/keys', { method: 'POST', body: { publicKey: identity.publicKey, backup, ...(reset ? { reset: true } : {}) } });
  } catch (error) {
    if (error instanceof AdminApiError && error.code === 'key_exists') return 'exists';
    throw error;
  }
  if (reset) await forgetLocal(owner);
  await saveIdentity(owner, identity);
  return 'ok';
}

export async function restoreKeys(owner: string, code: string): Promise<'ok' | 'wrong' | 'missing'> {
  const server = readServerKeys(await adminFetch('/api/keys'));
  if (!server.publicKey || !server.backup) return 'missing';
  const identity = await restoreIdentity(server.backup, server.publicKey, code);
  if (!identity) return 'wrong';
  await saveIdentity(owner, identity);
  return 'ok';
}

/** Room keys already stored on this device, so a background notification can open the message text. */
export async function localRoomKeyRecords(): Promise<Array<{ roomId: string; keyId: string; raw: string }> | null> {
  try {
    const rows = await store('readonly', (table) => table.getAll()) as Array<{ key?: string; raw?: Uint8Array }>;
    const records = [];
    for (const row of rows) {
      if (typeof row?.key !== 'string' || !row.key.startsWith('room:') || row.raw?.length !== 32) continue;
      const parts = row.key.split(':');
      if (parts.length !== 4 || !parts[2] || !parts[3]) continue;
      records.push({ roomId: parts[2], keyId: parts[3], raw: toBase64Url(row.raw) });
    }
    return records;
  } catch {
    return null;
  }
}

async function heldKeys(owner: string, roomId: string) {
  const slot = roomSlot(owner, roomId);
  let held = roomKeys.get(slot);
  if (held) return held;
  held = new Map();
  const rows = await store('readonly', (table) => table.getAll(IDBKeyRange.bound(prefix(owner, roomId), `${prefix(owner, roomId)}\uffff`)))
    .catch(() => []) as Array<{ keyId: string; raw: Uint8Array }>;
  for (const row of rows) held.set(row.keyId, { raw: row.raw, key: await importRoomKey(row.raw) });
  roomKeys.set(slot, held);
  return held;
}

async function holdKey(owner: string, roomId: string, keyId: string, raw: Uint8Array) {
  const held = await heldKeys(owner, roomId);
  held.set(keyId, { raw, key: await importRoomKey(raw) });
  await store('readwrite', (table) => table.put({ key: `${prefix(owner, roomId)}${keyId}`, keyId, raw })).catch(() => undefined);
}

function readRoomKeys(payload: unknown) {
  const row = payload as { members?: unknown; keys?: unknown; mine?: unknown } | null;
  if (!row || !Array.isArray(row.members) || !Array.isArray(row.keys) || !Array.isArray(row.mine)) throw new AdminApiError('invalid_keys', 400);
  return {
    members: (row.members as Array<{ id: string; publicKey: string | null }>).filter((item) => typeof item?.id === 'string'),
    keys: (row.keys as RoomInfo['keys']).filter((item) => typeof item?.keyId === 'string' && Array.isArray(item.memberIds)),
    mine: (row.mine as Array<{ keyId: string; wrapperPublic: string; wrapped: string }>).filter((item) => typeof item?.keyId === 'string' && typeof item.wrapped === 'string'),
  };
}

async function loadRoom(owner: string, roomId: string): Promise<RoomInfo> {
  const slot = roomSlot(owner, roomId);
  const pending = roomLoads.get(slot);
  if (pending) return pending;
  const promise = (async () => {
    const identity = await localIdentity(owner);
    if (!identity) throw new Error('no_identity');
    const payload = readRoomKeys(await adminFetch(`/api/rooms/${roomId}/keys`));
    const held = await heldKeys(owner, roomId);
    for (const row of payload.mine) {
      if (held.has(row.keyId)) continue;
      try { await holdKey(owner, roomId, row.keyId, await unwrapRoomKey(identity.privateKey, row.wrapperPublic, row.wrapped, roomId, row.keyId, owner)); }
      catch { /* A wrap made for an older identity of mine cannot be opened; others will re-share. */ }
    }
    const info = { at: Date.now(), members: payload.members, keys: payload.keys };
    roomInfo.set(slot, info);
    return info;
  })().finally(() => { if (roomLoads.get(slot) === promise) roomLoads.delete(slot); });
  roomLoads.set(slot, promise);
  return promise;
}

async function postWraps(roomId: string, wraps: Array<{ keyId: string; memberId: string; wrapped: string }>) {
  for (let index = 0; index < wraps.length; index += WRAPS_PER_REQUEST) {
    await adminFetch(`/api/rooms/${roomId}/keys`, { method: 'POST', body: { wraps: wraps.slice(index, index + WRAPS_PER_REQUEST) } });
  }
}

/** Returns the key to seal with, rotating it when a former member still holds the current one. */
export async function ensureRoomKey(owner: string, roomId: string, participantIds: string[] = []) {
  const identity = await localIdentity(owner);
  // Retryable: queued messages wait until the key screen is completed.
  if (!identity) throw new AdminApiError('no_identity', 503);
  const slot = roomSlot(owner, roomId);
  let info = roomInfo.get(slot);
  const signature = [...participantIds].sort().join(',');
  const stale = !info || Date.now() - info.at > ROOM_INFO_TTL_MS
    || (participantIds.length > 0 && signature !== info.members.map((item) => item.id).sort().join(','));
  if (stale) info = await loadRoom(owner, roomId);
  const room = info!;
  const held = await heldKeys(owner, roomId);
  const memberIds = new Set(room.members.map((item) => item.id));
  const readers = room.members.filter((item): item is { id: string; publicKey: string } => typeof item.publicKey === 'string');
  const current = room.keys.find((key) => held.has(key.keyId));
  if (!current || current.memberIds.some((id) => !memberIds.has(id))) {
    const keyId = crypto.randomUUID();
    const raw = newRoomKey();
    const wraps = await Promise.all(readers.map(async (member) => ({
      keyId, memberId: member.id, wrapped: await wrapRoomKey(identity.privateKey, member.publicKey, raw, roomId, keyId, member.id),
    })));
    await postWraps(roomId, wraps);
    await holdKey(owner, roomId, keyId, raw);
    room.keys.unshift({ keyId, createdAt: new Date().toISOString(), memberIds: readers.map((item) => item.id) });
    return { keyId, key: held.get(keyId)!.key };
  }
  const missing: Array<{ keyId: string; memberId: string; wrapped: string }> = [];
  for (const key of room.keys) {
    const mine = held.get(key.keyId);
    if (!mine) continue;
    for (const member of readers) {
      if (key.memberIds.includes(member.id)) continue;
      missing.push({ keyId: key.keyId, memberId: member.id, wrapped: await wrapRoomKey(identity.privateKey, member.publicKey, mine.raw, roomId, key.keyId, member.id) });
    }
  }
  if (missing.length) {
    await postWraps(roomId, missing);
    for (const wrap of missing) room.keys.find((key) => key.keyId === wrap.keyId)?.memberIds.push(wrap.memberId);
  }
  return { keyId: current.keyId, key: held.get(current.keyId)!.key };
}

async function keyFor(owner: string, roomId: string, keyId: string) {
  const held = await heldKeys(owner, roomId);
  const known = held.get(keyId);
  if (known) return known.key;
  const loading = roomLoads.get(roomSlot(owner, roomId));
  if (loading) {
    await loading.catch(() => undefined);
    return held.get(keyId)?.key ?? null;
  }
  const slot = `${roomSlot(owner, roomId)}:${keyId}`;
  if (Date.now() - (unknownTried.get(slot) ?? 0) < UNKNOWN_KEY_RETRY_MS) return null;
  unknownTried.set(slot, Date.now());
  await loadRoom(owner, roomId).catch(() => undefined);
  return held.get(keyId)?.key ?? null;
}

const textAad = (roomId: string, messageId: string) => `${roomId}|${messageId}`;
const mediaAad = (roomId: string, messageId: string) => `${roomId}|${messageId}|media`;

export async function sealMessageText(owner: string, roomId: string, messageId: string, text: string, participantIds?: string[]) {
  const { keyId, key } = await ensureRoomKey(owner, roomId, participantIds);
  return sealText(key, keyId, textAad(roomId, messageId), text);
}

export async function sealMessageMedia(owner: string, roomId: string, messageId: string, bytes: Uint8Array, body: string, participantIds?: string[]) {
  const { keyId, key } = await ensureRoomKey(owner, roomId, participantIds);
  return { bytes: await sealBytes(key, mediaAad(roomId, messageId), bytes), body: await sealText(key, keyId, textAad(roomId, messageId), body) };
}

export async function openMessageMedia(owner: string, message: Pick<Message, 'conversationId' | 'id' | 'sealedKey'>, bytes: Uint8Array) {
  if (!message.sealedKey) return bytes;
  const key = await keyFor(owner, message.conversationId, message.sealedKey);
  if (!key) throw new Error('locked');
  return openBytes(key, mediaAad(message.conversationId, message.id), bytes);
}

/** Decrypts a notification or saved-item envelope; null keeps the server placeholder. */
export async function openPreview(owner: string, roomId: string, messageId: string, envelope: string) {
  const keyId = sealedKeyId(envelope);
  if (!keyId || !(await localIdentity(owner))) return null;
  const key = await keyFor(owner, roomId, keyId).catch(() => null);
  if (!key) return null;
  return openText(key, envelope, textAad(roomId, messageId)).catch(() => null);
}

async function openOne(owner: string, message: Message): Promise<Message> {
  const envelope = message.text!;
  const keyId = sealedKeyId(envelope);
  const key = keyId ? await keyFor(owner, message.conversationId, keyId).catch(() => null) : null;
  const plain = key ? await openText(key, envelope, textAad(message.conversationId, message.id)).catch(() => null) : null;
  if (plain === null || !keyId) {
    return { ...message, type: 'text', text: LOCKED_TEXT, locked: true, media: undefined, link: undefined, ...(keyId ? { sealedKey: keyId } : {}) };
  }
  if (message.type === 'image') return { ...message, text: '', sealedKey: keyId };
  if (message.type === 'file' || message.type === 'video') return { ...message, text: '', sealedKey: keyId, media: message.media ? { ...message.media, fileName: plain.trim().slice(0, 120) || (message.type === 'video' ? 'فيديو' : 'ملف') } : undefined };
  const url = firstUrl(plain);
  return { ...message, text: plain, sealedKey: keyId, link: url ? linkDraft(url) : undefined };
}

/** Returns the same array when nothing is sealed, so callers keep referential equality. */
export async function openMessages(owner: string, messages: Message[]) {
  if (!messages.some((message) => !message.deletedForEveryone && isSealed(message.text))) return messages;
  if (!(await localIdentity(owner))) return messages.map((message) => !message.deletedForEveryone && isSealed(message.text)
    ? { ...message, type: 'text' as const, text: LOCKED_TEXT, locked: true, media: undefined, link: undefined } : message);
  return Promise.all(messages.map((message) => !message.deletedForEveryone && isSealed(message.text) ? openOne(owner, message) : message));
}
