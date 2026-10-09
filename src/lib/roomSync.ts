import { readRoomMessages, readRoomReaders } from './home';
import type { Message } from '../types/message';

export function readRoomSync(payload: unknown, roomId: string) {
  const row = payload as { historyHasMore?: unknown; cursor?: unknown; reset?: unknown; hasMore?: unknown; removedIds?: unknown } | null;
  if (!row || typeof row.cursor !== 'string' || !/^[0-9a-f-]{36}\.\d+$/.test(row.cursor) || typeof row.reset !== 'boolean' || typeof row.hasMore !== 'boolean'
    || !Array.isArray(row.removedIds) || row.removedIds.some((id) => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) return null;
  const messages = readRoomMessages(payload, roomId); if (!messages) return null;
  return { historyHasMore: row.historyHasMore === true, cursor: row.cursor, reset: row.reset, hasMore: row.hasMore, removedIds: row.removedIds as string[], messages, readers: readRoomReaders(payload) };
}
export function mergeRoomDelta(current: Message[], incoming: Message[], removed: string[], roomId: string) {
  const replaced = new Set([...incoming.map((message) => message.id), ...removed]);
  const room = [...current.filter((message) => message.conversationId === roomId && !replaced.has(message.id)), ...incoming]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const sent = room.filter((message) => message.status === 'sent').slice(-300);
  return [...current.filter((message) => message.conversationId !== roomId), ...sent, ...room.filter((message) => message.status !== 'sent')];
}
