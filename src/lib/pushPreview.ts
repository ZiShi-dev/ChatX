import { isServerId } from './home';
import { allowsNotificationAlert, type InboxKind } from './inbox';
import { inboxAlertKey, useLiveInbox, watchingRoom } from './liveInbox';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import { roomAllows, useMuteStore } from '../stores/muteStore';

/** A slow inbox fetch must not delay a received FCM banner. */
export function showPushPreview(data: unknown) {
  if (!data || typeof data !== 'object' || document.visibilityState === 'hidden') return;
  const item = data as Record<string, unknown>;
  const { conversationId, messageId, kind, createdAt, title, body } = item;
  if (!isServerId(String(conversationId)) || !isServerId(String(messageId)) || typeof kind !== 'string'
    || typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt)) || typeof title !== 'string' || typeof body !== 'string') return;
  const roomId = conversationId as string, id = messageId as string;
  const roomType = item.conversationType === 'private' ? 'private' : item.conversationType === 'group' || item.conversationType === 'global' ? item.conversationType : useChatStore.getState().conversations.find(room => room.id === roomId)?.type;
  if (!allowsNotificationAlert(kind as InboxKind, roomType) || watchingRoom(window.location.pathname, roomId)
    || useSettingsStore.getState().notifyTypes[kind as InboxKind] === false || !roomAllows(useMuteStore.getState().mutes, roomId, kind as InboxKind)) return;
  const row = useChatStore.getState().serverInbox.find(row => row.conversationId === roomId && row.kind === kind && row.ids.includes(id));
  if (row && !row.unread) return;
  useLiveInbox.getState().push({ key: inboxAlertKey({ id, kind, createdAt }), conversationId: roomId, messageId: id, conversationType: roomType, kind: kind as InboxKind, title: title.slice(0, 160), body: body.slice(0, 240), senderName: typeof item.senderName === 'string' ? item.senderName.slice(0, 80) : undefined, context: typeof item.conversationName === 'string' ? item.conversationName.slice(0, 120) : undefined });
}
