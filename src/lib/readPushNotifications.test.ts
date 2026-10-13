import { expect, it, vi } from 'vitest';
import { PushNotifications } from '@capacitor/push-notifications';
import { clearReadPushNotifications } from './readPushNotifications';
import type { InboxItem } from './inbox';
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: {
  getDeliveredNotifications: vi.fn(async () => ({ notifications: [{ id: '1', tag: 'read' }, { id: '2', tag: 'unread' }, { id: '3', data: { messageId: 'read' } }] })),
  removeDeliveredNotifications: vi.fn(async () => {}),
} }));
it('clears read notifications by message tag or data and preserves unrelated alerts', async () => {
  await clearReadPushNotifications([{ ids: ['read'], unread: false }, { ids: ['unread'], unread: true }] as InboxItem[]);
  expect(PushNotifications.removeDeliveredNotifications).toHaveBeenCalledWith({ notifications: [{ id: '1', tag: 'read' }, { id: '3', data: { messageId: 'read' } }] });
});
it('preserves a grouped conversation alert while another message remains unread', async () => {
  vi.mocked(PushNotifications.getDeliveredNotifications).mockResolvedValueOnce({ notifications: [
    { id: 'group', tag: 'room', data: { conversationId: 'room', messageId: 'read' } },
  ] });
  vi.mocked(PushNotifications.removeDeliveredNotifications).mockClear();
  await clearReadPushNotifications([{ conversationId: 'room', ids: ['read'], unread: false }, { conversationId: 'room', ids: ['other'], unread: true }] as InboxItem[]);
  expect(PushNotifications.removeDeliveredNotifications).not.toHaveBeenCalled();
});
