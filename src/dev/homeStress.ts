import { useEffect, useState } from 'react';
import type { Conversation } from '../types/conversation';
import type { Message } from '../types/message';
import type { User } from '../types/user';

export type HomeStressMode = 'demo' | 'worst' | 'empty' | 'one' | 'many';

/** Nom affiché : le serveur coupe à 40 unités UTF-16 (`authService` slice). */
export const STRESS_LONG_NAME = 'عبدالرحمن بن عبدالعزيز الهادي الكرام يون';
/** Nom de groupe : 40 graphèmes, limite de `server/src/home.ts`. */
export const STRESS_LONG_GROUP = 'مجموعة أصدقاء الحي القديم لمدينة الرياضـ';

export type HomeStressPack = {
  conversations: Conversation[];
  users: User[];
  messages: Message[];
  inbox: number;
  dockName?: string;
  dockPhoto?: string;
};

function parseMode(value: string | null): HomeStressMode {
  if (value === 'worst' || value === 'empty' || value === 'one' || value === 'many') return value;
  return 'demo';
}

export function useHomeStress() {
  const [mode, setMode] = useState<HomeStressMode>('demo');
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const read = () => setMode(parseMode(new URLSearchParams(window.location.search).get('data')));
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  const choose = (next: HomeStressMode) => {
    if (!import.meta.env.DEV) return;
    const url = new URL(window.location.href);
    if (next === 'demo') url.searchParams.delete('data');
    else url.searchParams.set('data', next);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    setMode(next);
  };
  return { mode: import.meta.env.DEV ? mode : 'demo' as const, choose };
}

function user(id: string, displayName: string, avatarUrl?: string): User {
  return {
    id,
    username: id,
    displayName,
    role: 'member',
    status: 'offline',
    bio: '',
    color: '#3d5a80',
    avatarUrl,
  };
}

function room(partial: Conversation): Conversation {
  return { createdAt: '2026-10-01T00:00:00.000Z', ...partial };
}

function text(id: string, conversationId: string, body: string, createdAt: string, extra?: Partial<Message>): Message {
  return {
    id,
    conversationId,
    senderId: 'stress-peer',
    type: 'text',
    text: body,
    status: 'sent',
    createdAt,
    ...extra,
  };
}

export function homeStressPack(mode: HomeStressMode, meId: string): HomeStressPack | null {
  if (mode === 'demo') return null;
  if (mode === 'empty') return { conversations: [], users: [], messages: [], inbox: 0 };
  if (mode === 'one') {
    const id = 'stress-one';
    return {
      conversations: [room({ id, type: 'private', participantIds: [meId, 'stress-short'], unreadCount: 1, lastMessageId: 'm-one', friend: 'friends' })],
      users: [user('stress-short', 'نو')],
      messages: [text('m-one', id, 'مرحبا', new Date().toISOString(), { senderId: 'stress-short' })],
      inbox: 1,
    };
  }
  if (mode === 'many') {
    const conversations: Conversation[] = [];
    const messages: Message[] = [];
    for (let index = 0; index < 80; index += 1) {
      const id = `stress-many-${index}`;
      const messageId = `m-many-${index}`;
      conversations.push(room({
        id,
        type: 'group',
        name: index === 0 ? STRESS_LONG_GROUP : `مجموعة ${index + 1}`,
        participantIds: [meId],
        unreadCount: index === 3 ? 1284 : 0,
        lastMessageId: messageId,
      }));
      messages.push(text(messageId, id, 'صورة', '2024-01-01T00:00:00.000Z'));
    }
    return { conversations, users: [], messages, inbox: 1284 };
  }

  const now = new Date().toISOString();
  const longId = 'stress-long';
  const emojiId = 'stress-emoji';
  const shortId = 'stress-short';
  const fileId = 'stress-file';
  const linkId = 'stress-link';
  const emptyId = 'stress-empty';
  const globalId = 'stress-global';
  const selfId = 'stress-self';
  const users = [
    user('stress-long', STRESS_LONG_NAME),
    user('stress-emoji', '🦊 ليلى'),
    user('stress-short', 'نو', 'https://example.invalid/avatar.png'),
    user('stress-sara', 'سارة'),
    user('stress-karim', 'كريم'),
    user('stress-nora', 'نورة'),
    user('stress-adel', 'عادل'),
  ];
  const messages: Message[] = [
    text('m-global', globalId, '😂🔥❤️👍🎉✨🥳💯', now),
    text('m-long', longId, 'هذا نص طويل بالعربية يصف آخر رسالة كما قد يكتبها شخص حقيقي في المجموعة، بلا انقطاع، حتى تملأ السطر كله وتتجاوزه.', '2023-03-12T08:00:00.000Z', { senderId: 'stress-long' }),
    text('m-emoji', emojiId, 'IMG_20250914_183022_HDR_portrait_edited_edited.HEIC', now, { senderId: 'stress-emoji', type: 'file', text: undefined, media: { fileName: 'IMG_20250914_183022_HDR_portrait_edited_edited.HEIC', fileSize: 4_000_000, state: 'remote' } }),
    text('m-short', shortId, '<script>alert(1)</script> &amp; **gras**', now, { senderId: 'stress-short' }),
    text('m-file', fileId, 'سطر أول\nسطر ثان', '2026-11-08T18:30:00.000Z'),
    text('m-link', linkId, '', '1970-01-01T00:00:00.000Z', { type: 'link', link: { url: 'https://example.com/workspaces/acme/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved', preview: 'notLoaded' } }),
    text('m-self', selfId, 'ملاحظة', now, { senderId: meId }),
  ];
  const conversations: Conversation[] = [
    room({ id: globalId, type: 'global', name: 'ChatX', participantIds: [meId, 'stress-long'], unreadCount: 1284, lastMessageId: 'm-global' }),
    room({ id: longId, type: 'private', participantIds: [meId, 'stress-long'], unreadCount: 0, lastMessageId: 'm-long', friend: 'incoming' }),
    room({ id: 'stress-sara', type: 'private', participantIds: [meId, 'stress-sara'], unreadCount: 0, friend: 'incoming' }),
    room({ id: 'stress-karim', type: 'private', participantIds: [meId, 'stress-karim'], unreadCount: 0, friend: 'incoming' }),
    room({ id: 'stress-nora', type: 'private', participantIds: [meId, 'stress-nora'], unreadCount: 0, friend: 'outgoing' }),
    room({ id: 'stress-adel', type: 'private', participantIds: [meId, 'stress-adel'], unreadCount: 0, friend: 'outgoing' }),
    room({ id: 'stress-group', type: 'group', name: STRESS_LONG_GROUP, participantIds: [meId], unreadCount: 100, lastMessageId: 'm-long', avatarUrl: undefined }),
    room({ id: emojiId, type: 'private', participantIds: [meId, 'stress-emoji'], unreadCount: 99, lastMessageId: 'm-emoji', friend: 'friends' }),
    room({ id: shortId, type: 'private', participantIds: [meId, 'stress-short'], unreadCount: 1, lastMessageId: 'm-short', friend: 'friends' }),
    room({ id: fileId, type: 'group', name: 'ملف', participantIds: ['stress-long'], unreadCount: 0, lastMessageId: 'm-file' }),
    room({ id: linkId, type: 'group', name: 'رابط', participantIds: [meId], unreadCount: 0, lastMessageId: 'm-link' }),
    room({ id: emptyId, type: 'group', name: '   ', participantIds: [meId], unreadCount: 0 }),
    room({ id: selfId, type: 'private', self: true, participantIds: [meId], unreadCount: 0, lastMessageId: 'm-self' }),
  ];
  return {
    conversations,
    users,
    messages,
    inbox: 1284,
    dockName: STRESS_LONG_NAME,
    dockPhoto: '',
  };
}
