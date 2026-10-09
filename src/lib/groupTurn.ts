import type { Conversation } from '../types/conversation';
import { readDirectoryUser } from './directory';
import { isServerId } from './home';

export function readGroupTurnPayload(payload: unknown, roomId: string) {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as Record<string, unknown>;
  if (row.roomId !== roomId || typeof row.turnUserId !== 'string' || !isServerId(row.turnUserId)) return null;
  if (!Array.isArray(row.participantIds) || row.participantIds.some((id) => typeof id !== 'string' || !isServerId(id)) || !row.participantIds.includes(row.turnUserId)) return null;
  if (typeof row.turnOpensAt !== 'string' || typeof row.turnExpiresAt !== 'string' || typeof row.serverTime !== 'string') return null;
  const opens = Date.parse(row.turnOpensAt), expires = Date.parse(row.turnExpiresAt), now = Date.parse(row.serverTime);
  if (![opens, expires, now].every(Number.isFinite) || expires !== opens + 7 * 24 * 60 * 60 * 1000) return null;
  if (row.participantIds.length > 1 && now >= expires) return null;
  const holder = readDirectoryUser(row.holder);
  if (!holder || holder.id !== row.turnUserId) return null;
  return { turnUserId: row.turnUserId, turnOpensAt: row.turnOpensAt,
    participantIds: row.participantIds as string[], serverTime: row.serverTime, holder };
}

/** A delayed home response cannot undo a turn already obtained from the dedicated endpoint. */
export function preserveCurrentTurn(incoming: Conversation, current?: Conversation): Conversation {
  if (!current?.turnOpensAt || !incoming.turnOpensAt || Date.parse(incoming.turnOpensAt) >= Date.parse(current.turnOpensAt)) return incoming;
  return { ...incoming, turnUserId: current.turnUserId, turnOpensAt: current.turnOpensAt, participantIds: current.participantIds };
}
