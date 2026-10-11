import { describe, expect, it } from 'vitest';
import { isIncomingRequest, privateTalkGate } from './friends';
import type { Conversation } from '../types/conversation';
import type { Message } from '../types/message';

const room: Conversation = {
  id: 'c-private',
  type: 'private',
  participantIds: ['me', 'layla'],
  unreadCount: 0,
  createdAt: '2026-10-11T00:00:00.000Z',
};

function text(senderId: string, event = false): Message {
  return {
    id: `${senderId}-1`,
    conversationId: room.id,
    senderId,
    type: 'text',
    text: 'مرحبا',
    status: 'sent',
    createdAt: '2026-10-11T00:00:00.000Z',
    event,
  };
}

describe('private talk', () => {
  it('allows one text, then locks until friendship', () => {
    expect(privateTalkGate({ type: 'private', messages: [] })).toBe('intro');
    expect(privateTalkGate({ type: 'private', messages: [text('me', true)] })).toBe('intro');
    expect(privateTalkGate({ type: 'private', messages: [text('me')] })).toBe('locked');
    expect(privateTalkGate({ type: 'private', friend: 'friends', messages: [text('me')] })).toBe('open');
    expect(privateTalkGate({ type: 'group', messages: [text('me')] })).toBe('open');
    expect(privateTalkGate({ type: 'private', self: true, messages: [] })).toBe('open');
  });

  it('keeps an unanswered private chat in requests', () => {
    expect(isIncomingRequest({ ...room, friend: 'incoming' }, [], 'me')).toBe(true);
    expect(isIncomingRequest(room, [text('layla')], 'me')).toBe(true);
    expect(isIncomingRequest(room, [text('me')], 'me')).toBe(false);
    expect(isIncomingRequest({ ...room, friend: 'outgoing' }, [text('me')], 'me')).toBe(false);
    expect(isIncomingRequest({ ...room, friend: 'friends' }, [text('layla')], 'me')).toBe(false);
  });
});
