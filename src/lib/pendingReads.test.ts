import { expect, it, vi } from 'vitest';
import { cacheInbox, flushPendingReads, overlayPendingReads, pendingReads, persistReads, queueInboxClear, queueNotificationReads, queueRoomRead } from './pendingReads';
import type { InboxItem } from './inbox';
const notice = (id: string, createdAt: string): InboxItem => ({ id, ids: [id], conversationId: 'room', senderId: 'sender', kind: 'signal', preview: 'turn', createdAt, unread: true, unreadCount: 1, count: 1, suppressed: false });
it('reflects an offline room read while leaving reactions and later messages unread', () => {
  const owner = crypto.randomUUID(); const room = crypto.randomUUID(); const id = crypto.randomUUID();
  const at = '2026-10-09T10:00:00.000Z';
  queueRoomRead(owner, room, id, at);
  const rows = overlayPendingReads(owner, [
    { ...notice(id, at), conversationId: room },
    { ...notice(id, at), conversationId: room, kind: 'reaction' },
    { ...notice(crypto.randomUUID(), '2026-10-09T10:01:00.000Z'), conversationId: room },
  ]);
  expect(rows.map(row => row.unread)).toEqual([false, true, true]);
});
it('keeps a newer reaction on the same message unread during a delayed read', async () => {
  const owner = crypto.randomUUID(); const id = crypto.randomUUID();
  const before = '2026-10-09T10:00:00.000Z'; const after = '2026-10-09T10:01:00.000Z';
  queueNotificationReads(owner, [id], undefined, { [id]: before });
  expect(overlayPendingReads(owner, [notice(id, after)])[0]?.unread).toBe(true);
  let finish: (() => void) | undefined;
  const send = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  let available = true;
  const drain = flushPendingReads(owner, () => available, send);
  queueNotificationReads(owner, [id], undefined, { [id]: after });
  available = false; finish!(); await drain;
  expect(pendingReads(owner).ids).toEqual([id]);
  expect(send).toHaveBeenCalledWith('/api/notifications/read', { ids: [id], until: before });
});
it('retains failed reads, batches retries, and isolates accounts', async () => {
  const owner = crypto.randomUUID(); const other = crypto.randomUUID();
  const ids = Array.from({ length: 61 }, () => crypto.randomUUID());
  queueNotificationReads(owner, ids);
  const failed = vi.fn(async () => { throw new Error('offline'); });
  await expect(flushPendingReads(owner, () => true, failed)).rejects.toThrow('offline');
  expect(pendingReads(owner).ids).toEqual(ids);
  expect(pendingReads(other).ids).toEqual([]);
  const send = vi.fn(async () => undefined);
  await flushPendingReads(owner, () => true, send);
  expect(send.mock.calls).toHaveLength(3);
  expect(pendingReads(owner).ids).toEqual([]);
  expect(JSON.parse(localStorage.getItem(`chatx.pendingReads.v1.${owner}`)!).ids).toEqual([]);
});
it('does not acknowledge a new room cursor using an older in-flight response', async () => {
  const owner = crypto.randomUUID(); const room = crypto.randomUUID();
  pendingReads(owner).rooms[room] = 'first'; persistReads(owner);
  let resolve: (() => void) | undefined;
  const send = vi.fn(() => new Promise<void>(done => { resolve = done; }));
  let available = true;
  const first = flushPendingReads(owner, () => available, send);
  const duplicate = flushPendingReads(owner, () => available, send);
  expect(first).toBe(duplicate);
  pendingReads(owner).rooms[room] = 'newer';
  available = false; resolve!(); await first;
  expect(pendingReads(owner).rooms[room]).toBe('newer');
});
it('keeps notifications after a mark-all cutoff unread and survives an account switch', async () => {
  const owner = crypto.randomUUID();
  queueNotificationReads(owner, [], '2026-10-09T12:00:00.000Z');
  const items = [notice('old', '2026-10-09T11:00:00.000Z'), notice('new', '2026-10-09T13:00:00.000Z')];
  expect(overlayPendingReads(owner, items).map(item => item.unread)).toEqual([false, true]);
  let available = true;
  await flushPendingReads(owner, () => available, async () => { available = false; });
  expect(pendingReads(owner).allUntil).toBe('2026-10-09T12:00:00.000Z');
});
it('clears older history without hiding future notifications and bounds the offline cache', async () => {
  const owner = crypto.randomUUID();
  queueInboxClear(owner, '2026-10-09T12:00:00.000Z');
  const items = [notice('old', '2026-10-09T11:00:00.000Z'), notice('new', '2026-10-09T13:00:00.000Z')];
  expect(overlayPendingReads(owner, items).map(item => item.id)).toEqual(['new']);
  await flushPendingReads(owner, () => true, async () => undefined);
  expect(overlayPendingReads(owner, items).map(item => item.id)).toEqual(['new']);
  cacheInbox(owner, Array.from({ length: 150 }, () => items[1]), 150);
  expect(pendingReads(owner).inbox).toHaveLength(100);
});
it('coalesces room reads monotonically and skips a room that is no longer accessible', async () => {
  const owner = crypto.randomUUID(); const room = crypto.randomUUID(); const second = crypto.randomUUID();
  const latest = crypto.randomUUID();
  queueRoomRead(owner, room, latest, '2026-10-09T12:00:00.000Z');
  queueRoomRead(owner, room, crypto.randomUUID(), '2026-10-09T11:00:00.000Z');
  expect(pendingReads(owner).rooms[room]).toBe(latest);
  queueRoomRead(owner, second, crypto.randomUUID(), '2026-10-09T12:00:00.000Z');
  const send = vi.fn(async (path: string) => { if (path.includes(room)) throw { status: 404 }; });
  await flushPendingReads(owner, () => true, send);
  expect(send).toHaveBeenCalledTimes(2);
  expect(pendingReads(owner).rooms).toEqual({});
});
