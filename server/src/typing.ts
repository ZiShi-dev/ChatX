import { wakeRoom } from './roomLive.ts';

const LIVE_MS = 8_000;
const marks = new Map<string, number>();

function liveIds(roomId: string, now: number) {
  const ids: string[] = [];
  for (const [id, expires] of marks) {
    if (expires <= now) {
      marks.delete(id);
      continue;
    }
    const split = id.indexOf('|');
    if (id.slice(0, split) === roomId) ids.push(id.slice(split + 1));
  }
  return ids.sort();
}

export function publishTyping(roomId: string, userId: string, on: boolean, now: number) {
  const before = liveIds(roomId, now).join(',');
  if (on) marks.set(`${roomId}|${userId}`, now + LIVE_MS);
  else marks.delete(`${roomId}|${userId}`);
  if (before !== liveIds(roomId, now).join(',')) wakeRoom(roomId);
}

export function roomTyping(roomId: string, now: number, exceptUserId: string) {
  return liveIds(roomId, now).filter((id) => id !== exceptUserId);
}
