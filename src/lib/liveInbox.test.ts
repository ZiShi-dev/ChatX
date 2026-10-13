import { afterEach, expect, it } from 'vitest';
import { inboxAlertKey, useLiveInbox, watchingRoom } from './liveInbox';
afterEach(() => useLiveInbox.getState().clear());
it('bounds live notifications, replaces duplicates, and dismisses one without marking a message read', () => {
  for (let index = 0; index < 102; index++) useLiveInbox.getState().push({ key: `${index}`, conversationId: 'private', messageId: `${index}`, title: 'Sender', body: 'Hello' });
  expect(useLiveInbox.getState().notices).toHaveLength(1);
  expect(useLiveInbox.getState().notices[0]).toMatchObject({ key: '101', count: 102 });
  useLiveInbox.getState().push({ key: '100', conversationId: 'private', messageId: '100', title: 'Sender', body: 'Older' });
  expect(useLiveInbox.getState().notices[0].key).toBe('101');
  useLiveInbox.getState().dismiss('101'); expect(useLiveInbox.getState().notices).toHaveLength(0);
});
it('distinguishes a new reaction and suppresses only the chat being read', () => {
  expect(inboxAlertKey({ id: 'one', kind: 'reaction', createdAt: 'now' })).not.toBe(inboxAlertKey({ id: 'one', kind: 'reaction', createdAt: 'later' }));
  expect(watchingRoom('/chat/group', 'private')).toBe(false);
  expect(watchingRoom('/chat/private', 'private')).toBe(true);
  expect(watchingRoom('/chat/private/media', 'private')).toBe(false);
});
it('keeps the latest sender and content even if decryption finishes out of order', () => {
  const push = useLiveInbox.getState().push;
  push({ key: 'new', conversationId: 'group', messageId: 'new', title: 'Group', senderName: 'Alice', body: 'Newest', createdAt: '2026-10-13T10:00:02Z' });
  push({ key: 'old', conversationId: 'group', messageId: 'old', title: 'Group', senderName: 'Bob', body: 'Older', createdAt: '2026-10-13T10:00:01Z' });
  expect(useLiveInbox.getState().notices[0]).toMatchObject({ senderName: 'Alice', body: 'Newest', count: 2 });
  push({ key: 'other', conversationId: 'private', messageId: 'other', title: 'Bob', body: 'Separate chat' });
  expect(useLiveInbox.getState().notices).toHaveLength(2);
});
