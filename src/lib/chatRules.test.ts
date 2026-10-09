import { describe, expect, it } from 'vitest';
import {
  canDeleteConversation,
  canLeaveConversation,
  recentConversations,
  catchUpLabel,
  resumeMessageId,
  unreadAbove,
  unreadDividerLabel,
  unreadOnScreen,
  unreadStart,
} from './conversation';
import { nextMediaState, shouldAutoDownload } from './media';
import { offlineBannerLabel, pendingMessageIds, statusAfterRetry } from './queue';
import { isPrivateBetween } from './conversation';
import { useChatStore } from '../stores/chatStore';
import { useUserStore } from '../stores/userStore';
import { USERS } from '../data/users';
import type { Conversation } from '../types/conversation';
import type { Message } from '../types/message';

const message = (id: string, conversationId: string, createdAt: string): Message => ({
  id,
  conversationId,
  senderId: 'me',
  type: 'text',
  text: id,
  status: 'sent',
  createdAt,
});

describe('global chat rules', () => {
  it('refuses to delete or leave the global chat', () => {
    expect(canDeleteConversation({ type: 'global' })).toBe(false);
    expect(canLeaveConversation({ type: 'global' })).toBe(false);
    expect(canDeleteConversation({ type: 'group' })).toBe(true);
    expect(canLeaveConversation({ type: 'private' })).toBe(true);
  });

  it('keeps the global chat out of the activity sort', () => {
    const conversations: Conversation[] = [
      { id: 'c-global', type: 'global', name: 'ChatX', participantIds: ['me'], unreadCount: 0 },
      { id: 'c-old', type: 'private', participantIds: ['me', 'amina'], unreadCount: 0, lastMessageId: 'old' },
      { id: 'c-new', type: 'group', name: 'Équipe', participantIds: ['me'], unreadCount: 0, lastMessageId: 'new' },
    ];
    const messages = [message('old', 'c-old', '2026-01-01T00:00:00.000Z'), message('new', 'c-new', '2026-02-01T00:00:00.000Z')];
    expect(recentConversations(conversations, messages).map((item) => item.id)).toEqual(['c-new', 'c-old']);
  });
});

describe('private chats', () => {
  it('does not open a second private chat with the same person', async () => {
    const previous = useUserStore.getState().users;
    useUserStore.setState({ users: USERS });
    const first = await useChatStore.getState().openPrivate('sofia');
    const second = await useChatStore.getState().openPrivate('sofia');
    expect(first).toBe(second);
    const matches = useChatStore.getState().conversations.filter((conversation) =>
      isPrivateBetween(conversation, 'me', 'sofia'),
    );
    expect(matches).toHaveLength(1);
    useUserStore.setState({ users: previous });
  });

  it('does not invent older messages', () => {
    const before = useChatStore.getState().messages.length;
    useChatStore.getState().loadOlder('c-amina');
    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(before);
    expect(messages.some((item) => item.text?.startsWith('رسالة سابقة'))).toBe(false);
  });
});

describe('pending queue', () => {
  it('lists only pending messages and retries according to the network', () => {
    expect(pendingMessageIds([
      { id: 'a', status: 'pending' },
      { id: 'b', status: 'sent' },
      { id: 'c', status: 'failed' },
      { id: 'd', status: 'pending' },
    ])).toEqual(['a', 'd']);
    expect(statusAfterRetry('offline')).toBe('pending');
    expect(statusAfterRetry('online')).toBe('sending');
    expect(statusAfterRetry('slow')).toBe('sending');
  });

  it('mentions the waiting count on the offline banner', () => {
    expect(offlineBannerLabel(0)).toContain('عند عودة الإنترنت');
    expect(offlineBannerLabel(3)).toContain('3 رسائل');
  });
});

describe('data saver and media', () => {
  it('blocks automatic downloads while data saver is on', () => {
    expect(shouldAutoDownload(true, true)).toBe(false);
    expect(shouldAutoDownload(false, true)).toBe(true);
    expect(shouldAutoDownload(false, false)).toBe(false);
  });

  it('moves media from remote to cached when the mock download finishes', () => {
    expect(nextMediaState('remote', 25)).toBe('downloading');
    expect(nextMediaState('downloading', 60)).toBe('downloading');
    expect(nextMediaState('downloading', 100)).toBe('cached');
  });
});

describe('unread', () => {
  it('hides an empty count and points at the first unread message', () => {
    expect(unreadDividerLabel(0)).toBe('');
    expect(unreadDividerLabel(3)).toContain('3');
    expect(unreadStart(10, 0)).toBe(-1);
    expect(unreadStart(10, 3)).toBe(7);
  });

  it('keeps a large unread batch off the first screen', () => {
    expect(unreadAbove(200, 250, 30)).toBe(170);
    expect(unreadOnScreen(200, 250, 30)).toBe(30);
    expect(unreadAbove(200, 50, 30)).toBe(20);
    expect(unreadAbove(10, 50, 30)).toBe(0);
    expect(catchUpLabel(200)).toBe('200 رسالة جديدة');
  });

  it('reopens on the last read message when newer ones follow it', () => {
    expect(resumeMessageId(['a', 'b', 'c'], 'b', 1)).toBe('b');
    expect(resumeMessageId(['a', 'b', 'c'], 'c', 0)).toBe('');
    expect(resumeMessageId(['a', 'b', 'c'], 'c', 1)).toBe('');
    expect(resumeMessageId(['a', 'b', 'c'], '', 2)).toBe('');
  });
});
