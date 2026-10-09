import { MAX_NOTIFICATION_PREVIEW_LENGTH, MESSAGE_PAGE_SIZE, NOTIFICATION_GROUP_WINDOW_MS } from '../constants/chat';
import { unreadStart } from './conversation';
import { messagePreview } from './media';
import { mentionTone } from './mention';
import { roomAllows, type ChatMute } from '../stores/muteStore';
import type { Conversation } from '../types/conversation';
import type { Message } from '../types/message';

export type InboxKind = 'mention' | 'everyone' | 'reply' | 'signal' | 'message' | 'reaction';

export type NotificationTone = 'high' | 'mid' | 'note' | 'plain';

export type NotifyTypePrefs = Record<InboxKind, boolean>;

export const DEFAULT_NOTIFY_TYPES: NotifyTypePrefs = {
  mention: true,
  everyone: true,
  reply: true,
  signal: true,
  message: true,
  reaction: true,
};

export type InboxItem = {
  id: string;
  ids: string[];
  count: number;
  conversationId: string;
  senderId: string;
  senderName?: string;
  conversationName?: string;
  kind: InboxKind;
  createdAt: string;
  preview: string;
  unread: boolean;
  unreadCount: number;
  suppressed: boolean;
};

const ROOM = new Set<Conversation['type']>(['group', 'global']);

export function notificationPresentation(kind: InboxKind): { label: string; tone: NotificationTone; ltr?: boolean } {
  if (kind === 'mention') return { label: 'إشارة', tone: 'high' };
  if (kind === 'reply') return { label: 'رد', tone: 'high' };
  if (kind === 'everyone') return { label: '@everyone', tone: 'mid', ltr: true };
  if (kind === 'signal') return { label: 'تنبيه', tone: 'note' };
  if (kind === 'reaction') return { label: 'تفاعل', tone: 'high' };
  return { label: 'رسالة', tone: 'plain' };
}

export function notificationPreview(text: string) {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= MAX_NOTIFICATION_PREVIEW_LENGTH) return flat;
  return `${flat.slice(0, MAX_NOTIFICATION_PREVIEW_LENGTH)}…`;
}

export function formatInboxBadge(count: number) {
  if (count <= 0) return '';
  if (count > 99) return '99+';
  return String(count);
}

/** Dernière réaction d'une autre personne sur un message à moi. Une seule notice par message. */
export function reactionNotice(message: Message, userId: string) {
  if (message.senderId !== userId || message.deletedForEveryone) return undefined;
  const list = message.reactions;
  if (!list?.length) return undefined;
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const item = list[index];
    if (item && item.userId !== userId && item.emoji) return item;
  }
  return undefined;
}

export function inboxKind(message: Message, messages: Message[], userId: string, username: string): InboxKind | null {
  if (message.senderId === userId || message.deletedForEveryone) return null;
  const tone = mentionTone(message.text ?? '', username);
  if (tone === 'direct') return 'mention';
  if (tone === 'everyone') return 'everyone';
  if (message.replyToId) {
    const parent = messages.find((item) => item.id === message.replyToId);
    if (parent?.senderId === userId) return 'reply';
  }
  if (message.text?.startsWith('تنبيه')) return 'signal';
  return 'message';
}

function roomSuppressed(mutes: ChatMute[], conversationId: string, kind: InboxKind) {
  return !roomAllows(mutes, conversationId, kind);
}

export function resolveMessageFocus(messages: Message[], conversationId: string, messageId: string, limit = MESSAGE_PAGE_SIZE) {
  const room = messages
    .filter((message) => message.conversationId === conversationId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const index = room.findIndex((message) => message.id === messageId);
  if (index < 0 || room[index]?.deletedForEveryone) return 'missing' as const;
  if (room.length - index > limit) return 'older' as const;
  return 'ready' as const;
}

function collapse(items: InboxItem[]) {
  const cards: InboxItem[] = [];
  items.forEach((item) => {
    const last = cards[cards.length - 1];
    const close = Boolean(
      last &&
        last.kind === 'message' &&
        item.kind === 'message' &&
        last.senderId === item.senderId &&
        last.conversationId === item.conversationId &&
        Math.abs(new Date(last.createdAt).getTime() - new Date(item.createdAt).getTime()) <= NOTIFICATION_GROUP_WINDOW_MS,
    );
    if (close && last) {
      last.ids.push(item.id);
      last.count += 1;
      last.unreadCount += item.unreadCount;
      last.unread = last.unreadCount > 0;
      last.suppressed = last.suppressed && item.suppressed;
      return;
    }
    cards.push({ ...item, ids: [item.id], count: 1 });
  });
  return cards;
}

export function groupNotifications(
  conversations: Conversation[],
  messages: Message[],
  userId: string,
  username: string,
  mutes: ChatMute[] = [],
  clearedAt?: string | null,
  readIds: ReadonlySet<string> | string[] = [],
  typePrefs: NotifyTypePrefs = DEFAULT_NOTIFY_TYPES,
): InboxItem[] {
  const read = readIds instanceof Set ? readIds : new Set(readIds);
  const items: InboxItem[] = [];
  conversations.forEach((conversation) => {
    if (!ROOM.has(conversation.type)) return;
    const room = messages
      .filter((message) => message.conversationId === conversation.id && !message.deletedForEveryone)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const unreadFrom = unreadStart(room.length, conversation.unreadCount);
    room.forEach((message, index) => {
      if (clearedAt && message.createdAt <= clearedAt) return;
      const kind = inboxKind(message, messages, userId, username);
      if (kind) {
        const inWindow = unreadFrom >= 0 && index >= unreadFrom;
        const unread = inWindow && !read.has(message.id);
        items.push({
          id: message.id,
          ids: [message.id],
          count: 1,
          conversationId: conversation.id,
          senderId: message.senderId,
          kind,
          createdAt: message.createdAt,
          preview: notificationPreview(messagePreview(message)),
          unread,
          unreadCount: unread ? 1 : 0,
          suppressed: roomSuppressed(mutes, conversation.id, kind) || typePrefs[kind] === false,
        });
      }
      const actor = reactionNotice(message, userId);
      if (!actor) return;
      const unread = !read.has(message.id);
      items.push({
        id: message.id,
        ids: [message.id],
        count: 1,
        conversationId: conversation.id,
        senderId: actor.userId,
        kind: 'reaction',
        createdAt: message.createdAt,
        preview: actor.emoji,
        unread,
        unreadCount: unread ? 1 : 0,
        suppressed: roomSuppressed(mutes, conversation.id, 'reaction') || typePrefs.reaction === false,
      });
    });
  });
  return collapse(items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export function inboxBadgeCount(items: InboxItem[]) {
  return items.reduce((count, item) => count + item.unreadCount, 0);
}

const INBOX_KIND = new Set<InboxKind>(['mention', 'everyone', 'reply', 'signal', 'message', 'reaction']);
const SERVER_ID = /^[0-9a-f-]{36}$/i;

export function readInboxPayload(payload: unknown): InboxItem[] | null {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { notifications?: unknown }).notifications)) return null;
  const items: InboxItem[] = [];
  for (const item of (payload as { notifications: unknown[] }).notifications) {
    if (!item || typeof item !== 'object') return null;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || !SERVER_ID.test(row.id)) return null;
    if (typeof row.conversationId !== 'string' || !SERVER_ID.test(row.conversationId)) return null;
    if (typeof row.senderId !== 'string' || !SERVER_ID.test(row.senderId)) return null;
    if (row.senderName !== undefined && (typeof row.senderName !== 'string' || row.senderName.length < 1 || row.senderName.length > 40)) return null;
    if (row.conversationName !== undefined && (typeof row.conversationName !== 'string' || row.conversationName.length < 1 || row.conversationName.length > 40)) return null;
    if (typeof row.kind !== 'string' || !INBOX_KIND.has(row.kind as InboxKind)) return null;
    if (typeof row.createdAt !== 'string' || typeof row.preview !== 'string' || row.preview.length > 81 || typeof row.unread !== 'boolean') return null;
    const kind = row.kind as InboxKind;
    items.push({
      id: row.id,
      ids: [row.id],
      count: 1,
      conversationId: row.conversationId,
      senderId: row.senderId,
      ...(typeof row.senderName === 'string' ? { senderName: row.senderName } : {}),
      ...(typeof row.conversationName === 'string' ? { conversationName: row.conversationName } : {}),
      kind,
      createdAt: row.createdAt,
      preview: row.preview,
      unread: row.unread,
      unreadCount: row.unread ? 1 : 0,
      suppressed: false,
    });
  }
  return items;
}

export function readInboxUnread(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as { unreadCount?: unknown }).unreadCount;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10000) return null;
  return value;
}

export function unseenInboxAlerts(known: ReadonlySet<string>, items: InboxItem[]) {
  return items.filter((item) => item.unread && !item.suppressed && !known.has(item.id));
}

export function presentInbox(items: InboxItem[], mutes: ChatMute[] = [], typePrefs: NotifyTypePrefs = DEFAULT_NOTIFY_TYPES) {
  const decorated = items.map((item) => ({
    ...item,
    suppressed: roomSuppressed(mutes, item.conversationId, item.kind) || typePrefs[item.kind] === false,
  }));
  return collapse(decorated.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}
