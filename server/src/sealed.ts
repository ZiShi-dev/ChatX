/** End-to-end envelopes are opaque here: the server checks shape and size, never content. */
export const SEALED_PREFIX = 'e2e1.';
export const SEALED_TEXT_MAX = 16_400;
/** AES-GCM adds a 12-byte IV and a 16-byte tag to every sealed attachment. */
export const SEALED_OVERHEAD = 28;
export const IMAGE_BYTES_MAX = 60_000;
export const FILE_BYTES_MAX = 262_144;
export const SEALED_FILE_NAME = 'file.bin';

const SEALED = /^e2e1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,16340}$/;
const ID = /^[0-9a-f-]{36}$/i;

export type NoticeHints = { mentions: string[]; everyone: boolean; signal: boolean };

export function isSealed(text: string | null | undefined) {
  return typeof text === 'string' && text.startsWith(SEALED_PREFIX);
}

export function cleanSealed(value: unknown) {
  if (typeof value !== 'string' || value.length > SEALED_TEXT_MAX || !SEALED.test(value)) return null;
  return value;
}

export function cleanHints(value: unknown): NoticeHints | null {
  if (value == null) return { mentions: [], everyone: false, signal: false };
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as { mentions?: unknown; everyone?: unknown; signal?: unknown };
  const mentions = row.mentions ?? [];
  if (!Array.isArray(mentions) || mentions.length > 50 || mentions.some((id) => typeof id !== 'string' || !ID.test(id))) return null;
  if (row.everyone !== undefined && typeof row.everyone !== 'boolean') return null;
  if (row.signal !== undefined && typeof row.signal !== 'boolean') return null;
  return { mentions: [...new Set(mentions as string[])], everyone: row.everyone === true, signal: row.signal === true };
}
