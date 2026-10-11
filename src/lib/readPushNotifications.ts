import { PushNotifications } from '@capacitor/push-notifications';
import type { InboxItem } from './inbox';

/** Remove only confirmed read messages, never unrelated unread system notifications. */
export async function clearReadPushNotifications(items: InboxItem[]) {
  const read = new Set(items.filter(item => !item.unread).flatMap(item => item.ids));
  if (!read.size) return;
  const delivered = await PushNotifications.getDeliveredNotifications();
  const notifications = delivered.notifications.filter(item => read.has(item.tag ?? '') || read.has(item.data?.messageId ?? ''));
  if (notifications.length) await PushNotifications.removeDeliveredNotifications({ notifications });
}
