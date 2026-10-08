export const PRESENCE_FRESH_MS = 45_000;

export type StoredPresence = {
  id: string;
  presence: 'online' | 'away' | null;
  lastSeenAt: Date | null;
};

export function visiblePresence(row: Pick<StoredPresence, 'presence' | 'lastSeenAt'>, now: number) {
  const fresh = row.lastSeenAt !== null && now - row.lastSeenAt.getTime() <= PRESENCE_FRESH_MS;
  const status = fresh && row.presence === 'away' ? 'away' : fresh && row.presence === 'online' ? 'online' : 'offline';
  return {
    status,
    ...(row.lastSeenAt ? { lastSeenAt: row.lastSeenAt.toISOString() } : {}),
  };
}
