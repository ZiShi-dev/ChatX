import { afterEach, expect, it } from 'vitest';
import { inboxAlertKey, useLiveInbox, watchingRoom } from './liveInbox';
afterEach(() => useLiveInbox.getState().clear());
it('bounds live notifications, replaces duplicates, and dismisses one without marking a message read', () => {
  for (let index = 0; index < 5; index++) useLiveInbox.getState().push({ key: `${index}`, conversationId: 'private', messageId: `${index}`, title: 'Sender', body: 'Hello' });
  expect(useLiveInbox.getState().notices.map(item => item.key)).toEqual(['2', '3', '4']);
  useLiveInbox.getState().dismiss('4'); expect(useLiveInbox.getState().notices).toHaveLength(2);
});
it('distinguishes a new reaction and suppresses only the chat being read', () => {
  expect(inboxAlertKey({ id: 'one', kind: 'reaction', createdAt: 'now' })).not.toBe(inboxAlertKey({ id: 'one', kind: 'reaction', createdAt: 'later' }));
  expect(watchingRoom('/chat/group', 'private')).toBe(false);
  expect(watchingRoom('/chat/private', 'private')).toBe(true);
  expect(watchingRoom('/chat/private/media', 'private')).toBe(false);
});
