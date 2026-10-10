import { afterEach, expect, it } from 'vitest';
import { useChatStore } from './chatStore';
import { useAuthStore } from './authStore';
import { useNetworkStore } from './networkStore';
import { pendingReads } from '../lib/pendingReads';
import type { InboxItem } from '../lib/inbox';
import type { Message } from '../types/message';
const auth = useAuthStore.getState(); const initial = useChatStore.getState();
afterEach(() => { useChatStore.setState(initial); useAuthStore.setState(auth); useNetworkStore.getState().setNetwork('online'); });
function setup(newerCursor: boolean) {
  const owner = crypto.randomUUID(), room = crypto.randomUUID(), id = crypto.randomUUID();
  const message: Message = { id, conversationId: room, senderId: owner, type: 'text', text: 'Hello', status: 'sent', createdAt: '2026-10-10T10:00:00.000Z' };
  const later = { ...message, id: crypto.randomUUID(), createdAt: '2026-10-10T10:01:00.000Z' };
  const notice: InboxItem = { id, ids: [id], count: 1, conversationId: room, senderId: 'someone', kind: 'reaction', createdAt: '2026-10-10T10:02:00.000Z', preview: '👍', unread: true, unreadCount: 1, suppressed: false };
  useAuthStore.setState({ activated: true, currentUser: { ...auth.currentUser, id: owner } }); useNetworkStore.getState().setNetwork('offline');
  useChatStore.setState({ conversations: [{ id: room, type: 'group', participantIds: [owner], unreadCount: 0 }], messages: [message, later], readCursors: { [room]: { [owner]: newerCursor ? later.id : id } }, serverInbox: [notice], serverUnread: 1 });
  return { owner, room, id, later, notice };
}
it.each([false, true])('clears the bell for an opened reaction even when its message was already read (newer cursor: %s)', async newer => {
  const { owner, room, id, later, notice } = setup(newer);
  await useChatStore.getState().markRead(room, id);
  expect(useChatStore.getState().serverUnread).toBe(0);
  expect(useChatStore.getState().serverInbox[0].unread).toBe(false);
  expect(useChatStore.getState().readCursors[room][owner]).toBe(newer ? later.id : id);
  expect(pendingReads(owner).idTimes?.[id]).toBe(notice.createdAt);
});
it('keeps unrelated unread notifications on the bell', async () => {
  const { room, id, notice } = setup(true);
  useChatStore.setState({ serverInbox: [notice, { ...notice, id: crypto.randomUUID(), conversationId: crypto.randomUUID() }], serverUnread: 2 });
  await useChatStore.getState().markRead(room, id);
  expect(useChatStore.getState().serverUnread).toBe(1);
  expect(useChatStore.getState().serverInbox[1].unread).toBe(true);
});
