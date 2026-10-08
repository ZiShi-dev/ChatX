import type { Conversation } from '../types/conversation';
import { GROUPS } from './groups';
import { MESSAGES } from './messages';
import { USERS } from './users';

export const GLOBAL_CHAT_ID = 'c-global';

const lastMessageId = (conversationId: string) =>
  [...MESSAGES]
    .filter((message) => message.conversationId === conversationId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id;

const groupConversations: Conversation[] = GROUPS.map((group) => ({
  id: group.id,
  type: group.type,
  name: group.name,
  participantIds: group.memberIds,
  adminId: group.adminId,
  lastMessageId: lastMessageId(group.id),
  unreadCount: group.id === 'c-burst' ? 200 : 0,
}));

const privateConversations: Conversation[] = [
  {
    id: 'c-amina',
    type: 'private',
    participantIds: ['me', 'amina'],
    lastMessageId: lastMessageId('c-amina'),
    unreadCount: 2,
  },
  {
    id: 'c-lucas',
    type: 'private',
    participantIds: ['me', 'lucas'],
    lastMessageId: lastMessageId('c-lucas'),
    unreadCount: 0,
  },
];

const globalConversation: Conversation = {
  id: GLOBAL_CHAT_ID,
  type: 'global',
  name: 'ChatX',
  participantIds: USERS.map((user) => user.id),
  adminId: 'me',
  lastMessageId: lastMessageId(GLOBAL_CHAT_ID),
  unreadCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const CONVERSATIONS: Conversation[] = [globalConversation, ...groupConversations, ...privateConversations];
