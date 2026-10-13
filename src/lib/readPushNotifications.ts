import { PushNotifications } from '@capacitor/push-notifications';
import type { InboxItem } from './inbox';

/** Remove only confirmed read messages, never unrelated unread system notifications. */
export async function clearReadPushNotifications(items: InboxItem[]) {
  const read = new Set(items.filter(item => !item.unread).flatMap(item => item.ids));
  if (!read.size) return;
  const delivered = await PushNotifications.getDeliveredNotifications();
  const unreadRooms = new Set(items.filter(item => item.unread).map(item => item.conversationId));
  const readRooms = new Set(items.filter(item => !item.unread).map(item => item.conversationId));
  const notifications = delivered.notifications.filter(item => {
    const roomId = item.data?.conversationId ?? (readRooms.has(item.tag ?? '') ? item.tag : undefined);
    if (roomId && unreadRooms.has(roomId)) return false;
    return read.has(item.tag ?? '') || read.has(item.data?.messageId ?? '') || Boolean(roomId && readRooms.has(roomId));
  });
  if (notifications.length) await PushNotifications.removeDeliveredNotifications({ notifications });
}
