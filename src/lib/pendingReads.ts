import type { InboxItem } from './inbox';

type PendingReads = { ids: string[]; idTimes?: Record<string, string>; allUntil?: string; clearUntil?: string; clearedUntil?: string; rooms: Record<string, string>; roomTimes?: Record<string, string>; inbox?: InboxItem[]; unread?: number };
const ID = /^[0-9a-f-]{36}$/i;
const cache = new Map<string, PendingReads>();
const key = (owner: string) => `chatx.pendingReads.v1.${owner}`;
export function pendingReads(owner: string): PendingReads {
  let state = cache.get(owner);
  if (!state) {
    state = { ids: [], rooms: {} };
    try {
      const stored = localStorage.getItem(key(owner)) || '{}';
      if (stored.length > 150000) throw new Error('invalid_cache');
      const raw = JSON.parse(stored);
      state.ids = Array.isArray(raw.ids) ? raw.ids.filter((id: unknown) => typeof id === 'string' && ID.test(id)).slice(-1000) : [];
      if (raw.idTimes && typeof raw.idTimes === 'object') state.idTimes = Object.fromEntries(Object.entries(raw.idTimes).filter(entry => state!.ids.includes(entry[0]) && typeof entry[1] === 'string' && Number.isFinite(Date.parse(entry[1])))) as Record<string, string>;
      if (typeof raw.allUntil === 'string' && Number.isFinite(Date.parse(raw.allUntil))) state.allUntil = raw.allUntil;
      for (const field of ['clearUntil', 'clearedUntil'] as const) if (typeof raw[field] === 'string' && Number.isFinite(Date.parse(raw[field]))) state[field] = raw[field];
      if (raw.rooms && typeof raw.rooms === 'object') state.rooms = Object.fromEntries(Object.entries(raw.rooms).filter((entry) => ID.test(entry[0]) && typeof entry[1] === 'string' && ID.test(entry[1])).slice(-100)) as Record<string, string>;
      if (raw.roomTimes && typeof raw.roomTimes === 'object') state.roomTimes = Object.fromEntries(Object.entries(raw.roomTimes).filter(entry => ID.test(entry[0]) && typeof entry[1] === 'string' && Number.isFinite(Date.parse(entry[1]))).slice(-100)) as Record<string, string>;
      if (Array.isArray(raw.inbox)) state.inbox = raw.inbox.filter((item: InboxItem) => item && typeof item.id === 'string' && typeof item.createdAt === 'string' && typeof item.preview === 'string' && item.preview.length <= 81 && typeof item.kind === 'string' && typeof item.unread === 'boolean').slice(0, 100);
      if (Number.isInteger(raw.unread) && raw.unread >= 0) state.unread = raw.unread;
    } catch { /* Start with an empty queue if local storage is malformed. */ }
    cache.set(owner, state);
  }
  return state;
}
export function persistReads(owner: string) {
  const state = pendingReads(owner);
  localStorage.setItem(key(owner), JSON.stringify(state));
}
export function queueNotificationReads(owner: string, ids: string[], allUntil?: string, idTimes?: Record<string, string>) {
  const state = pendingReads(owner);
  const merged = [...new Set([...state.ids, ...ids])];
  if (merged.length > 1000) throw new Error('read_queue_full');
  state.ids = merged;
  for (const id of ids) if (idTimes?.[id]) state.idTimes = { ...state.idTimes, [id]: idTimes[id] };
  if (allUntil && (!state.allUntil || allUntil > state.allUntil)) state.allUntil = allUntil;
  persistReads(owner);
}
export function cacheInbox(owner: string, inbox: InboxItem[], unread: number) {
  const state = pendingReads(owner);
  state.inbox = inbox.slice(0, 100); state.unread = unread; persistReads(owner);
}
export function queueInboxClear(owner: string, until: string) {
  const state = pendingReads(owner);
  if (!state.clearUntil || until > state.clearUntil) state.clearUntil = until;
  if (!state.clearedUntil || until > state.clearedUntil) state.clearedUntil = until;
  persistReads(owner);
}
export function queueRoomRead(owner: string, roomId: string, messageId: string, createdAt: string) {
  const state = pendingReads(owner); const previous = state.roomTimes?.[roomId];
  if (previous && (previous > createdAt || previous === createdAt && state.rooms[roomId] >= messageId)) return;
  state.rooms[roomId] = messageId;
  state.roomTimes = { ...state.roomTimes, [roomId]: createdAt }; persistReads(owner);
}
export function overlayPendingReads(owner: string, items: InboxItem[]) {
  const state = pendingReads(owner); const ids = new Set(state.ids);
  return items.filter(item => !state.clearedUntil || item.createdAt > state.clearedUntil).map(item => item.unread && (ids.has(item.id) && (!state.idTimes?.[item.id] || item.createdAt <= state.idTimes[item.id]) || state.allUntil && item.createdAt <= state.allUntil || item.kind !== 'reaction' && state.rooms[item.conversationId] && state.roomTimes?.[item.conversationId] && (item.createdAt < state.roomTimes[item.conversationId]! || item.createdAt === state.roomTimes[item.conversationId] && item.id <= state.rooms[item.conversationId]!))
    ? { ...item, unread: false, unreadCount: 0 } : item);
}

/** One drain per account; acknowledge only the exact captured intent. */
const draining = new Map<string, Promise<void>>();
export function flushPendingReads(owner: string, available: () => boolean, send: (path: string, body: unknown) => Promise<unknown>) {
  const existing = draining.get(owner); if (existing) return existing;
  const drain = (async () => {
    while (available()) {
      const state = pendingReads(owner);
      if (state.clearUntil) {
        const until = state.clearUntil;
        await send('/api/notifications/clear', { until });
        if (!available()) return;
        if (state.clearUntil === until) delete state.clearUntil;
      } else if (state.allUntil) {
        const until = state.allUntil;
        await send('/api/notifications/read', { all: true, until });
        if (!available()) return;
        if (state.allUntil === until) delete state.allUntil;
      } else if (state.ids.length) {
        const until = state.idTimes?.[state.ids[0]!];
        const ids = state.ids.filter(id => state.idTimes?.[id] === until).slice(0, 30);
        await send('/api/notifications/read', { ids, ...(until ? { until } : {}) });
        if (!available()) return;
        state.ids = state.ids.filter(id => !ids.includes(id) || state.idTimes?.[id] !== until);
        for (const id of ids) if (!state.ids.includes(id)) delete state.idTimes?.[id];
      } else {
        const entry = Object.entries(state.rooms)[0]; if (!entry) return;
        const [roomId, messageId] = entry;
        try { await send(`/api/rooms/${roomId}/read`, { messageId }); }
        catch (error) {
          if ((error as { status?: number } | null)?.status !== 404) throw error;
          // A deleted/inaccessible room must not block all other pending reads.
          if (state.rooms[roomId] === messageId) { delete state.rooms[roomId]; delete state.roomTimes?.[roomId]; }
          persistReads(owner); continue;
        }
        if (!available()) return;
        if (state.rooms[roomId] === messageId) { delete state.rooms[roomId]; delete state.roomTimes?.[roomId]; }
      }
      persistReads(owner);
    }
  })().finally(() => draining.delete(owner));
  draining.set(owner, drain); return drain;
}
