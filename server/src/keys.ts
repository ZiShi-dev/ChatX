import type { Deps } from './authService.ts';
import { hashSession } from './session.ts';
import type { KeyBackup, RoomKeyWrap } from './types.ts';

export const ROOM_KEY_WRAPS_MAX = 100;

const ID = /^[0-9a-f-]{36}$/i;
const PUBLIC_KEY = /^[A-Za-z0-9_-]{87}$/;
const B64 = (min: number, max: number) => new RegExp(`^[A-Za-z0-9_-]{${min},${max}}$`);
const SALT = B64(22, 22);
const IV = B64(16, 16);
const BACKUP_DATA = B64(32, 1024);
const WRAPPED = B64(16, 200);

async function member(deps: Deps, token: string) {
  if (!token) return null;
  const user = await deps.repo.findSessionUser(hashSession(token), new Date(deps.now()));
  return user?.role === 'member' ? user : null;
}

function cleanBackup(value: unknown): KeyBackup | null {
  if (!value || typeof value !== 'object') return null;
  const { salt, iv, data, iterations } = value as Record<string, unknown>;
  if (typeof salt !== 'string' || !SALT.test(salt) || typeof iv !== 'string' || !IV.test(iv)
    || typeof data !== 'string' || !BACKUP_DATA.test(data)
    || typeof iterations !== 'number' || !Number.isInteger(iterations) || iterations < 100_000 || iterations > 2_000_000) return null;
  return { salt, iv, data, iterations };
}

function cleanWraps(value: unknown): RoomKeyWrap[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > ROOM_KEY_WRAPS_MAX) return null;
  const wraps: RoomKeyWrap[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const { keyId, memberId, wrapped } = item as Record<string, unknown>;
    if (typeof keyId !== 'string' || !ID.test(keyId) || typeof memberId !== 'string' || !ID.test(memberId)
      || typeof wrapped !== 'string' || !WRAPPED.test(wrapped)) return null;
    wraps.push({ keyId: keyId.toLowerCase(), memberId: memberId.toLowerCase(), wrapped });
  }
  return wraps;
}

export async function readKeys(deps: Deps, token: string) {
  const user = await member(deps, token);
  if (!user) return { ok: false as const, error: 'invalid_credentials' as const };
  return { ok: true as const, keys: await deps.repo.readUserKeys(user.id) };
}

export async function saveKeys(deps: Deps, input: { token: string; publicKey: unknown; backup: unknown; reset: unknown }) {
  const backup = cleanBackup(input.backup);
  if (typeof input.publicKey !== 'string' || !PUBLIC_KEY.test(input.publicKey) || !backup) return { ok: false as const, error: 'invalid' as const };
  const user = await member(deps, input.token);
  if (!user) return { ok: false as const, error: 'invalid_credentials' as const };
  const saved = await deps.repo.saveUserKeys(user.id, input.publicKey, backup, input.reset === true);
  if (saved === 'missing') return { ok: false as const, error: 'not_found' as const };
  if (saved === 'exists') return { ok: false as const, error: 'key_exists' as const };
  return { ok: true as const };
}

export async function readRoomKeys(deps: Deps, input: { token: string; roomId: string }) {
  if (!ID.test(input.roomId)) return { ok: false as const, error: 'not_found' as const };
  const user = await member(deps, input.token);
  if (!user) return { ok: false as const, error: 'invalid_credentials' as const };
  const keys = await deps.repo.listRoomKeys(input.roomId, user.id);
  if (!keys) return { ok: false as const, error: 'not_found' as const };
  return {
    ok: true as const,
    members: keys.members,
    keys: keys.keys.map((key) => ({ ...key, createdAt: key.createdAt.toISOString() })),
    mine: keys.mine,
  };
}

export async function addRoomKeys(deps: Deps, input: { token: string; roomId: string; wraps: unknown }) {
  const wraps = cleanWraps(input.wraps);
  if (!ID.test(input.roomId) || !wraps) return { ok: false as const, error: 'invalid' as const };
  const user = await member(deps, input.token);
  if (!user) return { ok: false as const, error: 'invalid_credentials' as const };
  const saved = await deps.repo.addRoomKeys(input.roomId, user.id, wraps, new Date(deps.now()));
  if (saved === 'missing') return { ok: false as const, error: 'not_found' as const };
  if (saved === 'invalid') return { ok: false as const, error: 'invalid' as const };
  return { ok: true as const };
}
