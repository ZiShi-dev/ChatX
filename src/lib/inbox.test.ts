import { describe, expect, it } from 'vitest';
import { nextBanner } from './cover';
import { DEFAULT_NOTIFY_TYPES, formatInboxBadge, groupNotifications, inboxBadgeCount, inboxKind, notificationPresentation, notificationPreview, presentInbox, readInboxPayload, readInboxUnread, resolveMessageFocus, unseenInboxAlerts, type InboxItem } from './inbox';
import { hasAdminAccess } from './roles';
import { MAX_NOTIFICATION_PREVIEW_LENGTH } from '../constants/chat';
import type { Conversation } from '../types/conversation';
import type { Message } from '../types/message';

const message = (patch: Partial<Message> & Pick<Message, 'id' | 'senderId' | 'conversationId'>): Message => ({
  type: 'text',
  text: 'مرحبا',
  status: 'sent',
  createdAt: '2026-10-08T10:00:00.000Z',
  ...patch,
});

const group: Conversation = {
  id: 'c-equipe',
  type: 'group',
  name: 'Équipe',
  participantIds: ['me', 'amina'],
  unreadCount: 1,
};

describe('group inbox', () => {
  const messages = [
    message({ id: 'mine', senderId: 'me', conversationId: 'c-equipe', createdAt: '2026-10-08T09:00:00.000Z', text: 'أبدأ' }),
    message({ id: 'mention', senderId: 'amina', conversationId: 'c-equipe', createdAt: '2026-10-08T10:00:00.000Z', text: '@mrerreur راجع هذا' }),
    message({ id: 'all', senderId: 'sofia', conversationId: 'c-equipe', createdAt: '2026-10-08T11:00:00.000Z', text: '@everyone اجتماع' }),
    message({ id: 'reply', senderId: 'lucas', conversationId: 'c-equipe', createdAt: '2026-10-08T12:00:00.000Z', text: 'تمام', replyToId: 'mine' }),
    message({ id: 'plain', senderId: 'sofia', conversationId: 'c-equipe', createdAt: '2026-10-08T13:00:00.000Z', text: 'تم' }),
    message({ id: 'dm', senderId: 'amina', conversationId: 'c-amina', createdAt: '2026-10-08T14:00:00.000Z', text: '@mrerreur خاص' }),
  ];

  it('keeps every group kind, including when the room is muted', () => {
    const items = groupNotifications(
      [group, { id: 'c-amina', type: 'private', participantIds: ['me', 'amina'], unreadCount: 1 }],
      messages,
      'me',
      'mrerreur',
      [{ conversationId: 'c-equipe', level: 'none' }],
    );
    expect(items.map((item) => item.kind)).toEqual(['message', 'reply', 'everyone', 'mention']);
    expect(items.every((item) => item.suppressed)).toBe(true);
    expect(items.find((item) => item.id === 'plain')?.unread).toBe(true);
    expect(items.some((item) => item.id === 'dm')).toBe(false);
  });

  it('does not turn your own message into a notification', () => {
    expect(inboxKind(messages[0], messages, 'me', 'mrerreur')).toBeNull();
  });

  it('hides notifications that arrived before the inbox was cleared', () => {
    const items = groupNotifications([group], messages, 'me', 'mrerreur', [], '2026-10-08T11:30:00.000Z');
    expect(items.map((item) => item.id)).toEqual(['plain', 'reply']);
  });

  it('keeps replies visible when the room only allows mentions and replies', () => {
    const items = groupNotifications([group], messages, 'me', 'mrerreur', [{ conversationId: 'c-equipe', level: 'mentions' }]);
    expect(items.find((item) => item.kind === 'mention')?.suppressed).toBe(false);
    expect(items.find((item) => item.kind === 'reply')?.suppressed).toBe(false);
    expect(items.find((item) => item.kind === 'message')?.suppressed).toBe(true);
    expect(items.find((item) => item.kind === 'everyone')?.suppressed).toBe(true);
  });

  it('marks one notification read without clearing the others', () => {
    const loud = { ...group, unreadCount: 4 };
    const unread = groupNotifications([loud], messages, 'me', 'mrerreur');
    expect(inboxBadgeCount(unread)).toBe(4);
    const after = groupNotifications([loud], messages, 'me', 'mrerreur', [], null, new Set(['plain']));
    expect(after.find((item) => item.id === 'plain')?.unread).toBe(false);
    expect(inboxBadgeCount(after)).toBe(3);
  });

  it('groups nearby plain messages and still counts each unread one', () => {
    const burst = [
      message({ id: 'a', senderId: 'amina', conversationId: 'c-equipe', createdAt: '2026-10-08T10:00:00.000Z', text: 'واحد' }),
      message({ id: 'b', senderId: 'amina', conversationId: 'c-equipe', createdAt: '2026-10-08T10:05:00.000Z', text: 'اثنان' }),
      message({ id: 'c', senderId: 'amina', conversationId: 'c-equipe', createdAt: '2026-10-08T10:08:00.000Z', text: 'ثلاثة' }),
    ];
    const items = groupNotifications([{ ...group, unreadCount: 3 }], burst, 'me', 'mrerreur');
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('c');
    expect(items[0]?.count).toBe(3);
    expect(items[0]?.unreadCount).toBe(3);
  });

  it('mutes a type from the global setting without hiding it', () => {
    const items = groupNotifications([group], messages, 'me', 'mrerreur', [], null, [], { ...DEFAULT_NOTIFY_TYPES, message: false });
    expect(items.find((item) => item.kind === 'message')?.suppressed).toBe(true);
    expect(items.find((item) => item.kind === 'mention')?.suppressed).toBe(false);
  });
});

describe('notification presentation', () => {
  it('keeps a short label and a quiet priority for each type', () => {
    expect(notificationPresentation('mention')).toMatchObject({ label: 'إشارة', tone: 'high' });
    expect(notificationPresentation('reply').tone).toBe('high');
    expect(notificationPresentation('everyone').tone).toBe('mid');
    expect(notificationPresentation('signal').tone).toBe('note');
    expect(notificationPresentation('message')).toMatchObject({ label: 'رسالة', tone: 'plain' });
  });

  it('caps the preview and the badge', () => {
    expect(notificationPreview('م'.repeat(MAX_NOTIFICATION_PREVIEW_LENGTH + 12)).length).toBe(MAX_NOTIFICATION_PREVIEW_LENGTH + 1);
    expect(formatInboxBadge(0)).toBe('');
    expect(formatInboxBadge(27)).toBe('27');
    expect(formatInboxBadge(120)).toBe('99+');
  });

  it('treats a notice as a signal and not as a normal message', () => {
    expect(inboxKind(message({ id: 's', senderId: 'amina', conversationId: 'c-equipe', text: 'تنبيه: موعد' }), [], 'me', 'mrerreur')).toBe('signal');
  });
});

describe('server inbox', () => {
  it('reads a mention and keeps a muted room visible', () => {
    const room = '00000000-0000-4000-8000-000000000001';
    const sender = '11111111-1111-4111-8111-111111111111';
    const messageId = '33333333-3333-4333-8333-333333333333';
    const items = readInboxPayload({
      notifications: [{ id: messageId, conversationId: room, senderId: sender, kind: 'mention', createdAt: '2026-10-08T12:00:00.000Z', preview: '@نورة', unread: true }],
    });
    expect(items?.[0]?.kind).toBe('mention');
    expect(items?.[0]?.senderName).toBeUndefined();
    const named = readInboxPayload({
      notifications: [{ id: messageId, conversationId: room, senderId: sender, senderName: 'ليلى', conversationName: 'ChatX', kind: 'mention', createdAt: '2026-10-08T12:00:00.000Z', preview: '@نورة', unread: true }],
      unreadCount: 2,
    });
    expect(named?.[0]?.senderName).toBe('ليلى');
    expect(named?.[0]?.conversationName).toBe('ChatX');
    expect(readInboxUnread({ unreadCount: 2 })).toBe(2);
    expect(readInboxUnread({ unreadCount: -1 })).toBeNull();
    expect(readInboxPayload({
      notifications: [{ id: messageId, conversationId: room, senderId: sender, kind: 'reaction', createdAt: '2026-10-08T12:00:00.000Z', preview: '❤️', unread: true }],
    })?.[0]?.kind).toBe('reaction');
    expect(presentInbox(items ?? [], [{ conversationId: room, level: 'none' }])[0]?.suppressed).toBe(true);
    expect(readInboxPayload({ notifications: [{ id: messageId, kind: 'nope' }] })).toBeNull();
  });
});

describe('alerts after leaving', () => {
  const item = (id: string, unread = true): InboxItem => ({
    id,
    ids: [id],
    count: 1,
    conversationId: '00000000-0000-4000-8000-000000000001',
    senderId: '11111111-1111-4111-8111-111111111111',
    kind: 'mention',
    createdAt: '2026-10-08T12:00:00.000Z',
    preview: 'مرحبا',
    unread,
    unreadCount: unread ? 1 : 0,
    suppressed: false,
  });

  it('alerts only for a new unread item', () => {
    const known = new Set(['33333333-3333-4333-8333-333333333333']);
    const fresh = unseenInboxAlerts(known, [item('33333333-3333-4333-8333-333333333333'), item('44444444-4444-4444-8444-444444444444')]);
    expect(fresh.map((entry) => entry.id)).toEqual(['44444444-4444-4444-8444-444444444444']);
    expect(unseenInboxAlerts(known, [{ ...item('44444444-4444-4444-8444-444444444444'), suppressed: true }])).toEqual([]);
  });
});

describe('message focus', () => {
  const many = Array.from({ length: 40 }, (_, index) =>
    message({
      id: `m${index}`,
      senderId: 'amina',
      conversationId: 'c-equipe',
      createdAt: `2026-10-08T10:${String(index).padStart(2, '0')}:00.000Z`,
    }),
  );

  it('asks to reveal an older page and reports a missing message', () => {
    expect(resolveMessageFocus(many, 'c-equipe', 'm0', 30)).toBe('older');
    expect(resolveMessageFocus(many, 'c-equipe', 'm39', 30)).toBe('ready');
    expect(resolveMessageFocus(many, 'c-equipe', 'gone', 30)).toBe('missing');
    expect(resolveMessageFocus([message({ id: 'gone', senderId: 'amina', conversationId: 'c-equipe', deletedForEveryone: true })], 'c-equipe', 'gone', 30)).toBe('missing');
  });
});

describe('account access and cover', () => {
  it('hides admin tools from a member and keeps them for admin and creator', () => {
    expect(hasAdminAccess('member')).toBe(false);
    expect(hasAdminAccess('admin')).toBe(true);
    expect(hasAdminAccess('creator')).toBe(true);
  });

  it('drops the cover back to the gradient when it is removed', () => {
    expect(nextBanner('remove')).toBeUndefined();
    expect(nextBanner('data:image/jpeg;base64,abc')).toBe('data:image/jpeg;base64,abc');
  });
});
