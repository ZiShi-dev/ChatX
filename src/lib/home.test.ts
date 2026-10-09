import { describe, expect, it } from 'vitest';
import { mergeHomeMessages, readHomePayload, readOpenedRoom, readRoomMessages, readRoomReaders, readUpdatedRoom } from './home';
import { canTakeGroupTurn } from './roles';
import type { Message } from '../types/message';

const room = '00000000-0000-4000-8000-000000000001';
const user = '11111111-1111-4111-8111-111111111111';

describe('home payload', () => {
  it('reads ChatX and its last message', () => {
    const home = readHomePayload({
      conversations: [{
        id: room,
        type: 'global',
        name: 'ChatX',
        participantIds: [user],
        unreadCount: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        lastMessage: { id: '33333333-3333-4333-8333-333333333333', senderId: user, text: 'مرحبا', createdAt: '2026-10-08T12:00:00.000Z', deleted: false },
      }],
      users: [{ id: user, displayName: 'نورة', username: 'نورة', role: 'member', bio: '' }],
    });
    expect(home?.conversations[0]?.name).toBe('ChatX');
    expect(home?.messages[0]?.text).toBe('مرحبا');
    expect(home?.users[0]?.displayName).toBe('نورة');
  });

  it('keeps a renamed main room', () => {
    const home = readHomePayload({
      conversations: [{
        id: room,
        type: 'global',
        name: 'الساحة',
        participantIds: [user],
        unreadCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        turnUserId: user,
        turnOpensAt: '2026-10-15T12:00:00.000Z',
      }],
      users: [{ id: user, displayName: 'نورة', username: 'نورة', role: 'member', bio: '' }],
    });
    expect(home?.conversations[0]?.name).toBe('الساحة');
    expect(home?.conversations[0]?.turnUserId).toBe(user);
  });

  it('keeps a loaded thread when home only sends the last message', () => {
    const older: Message = {
      id: '22222222-2222-4222-8222-222222222222',
      conversationId: room,
      senderId: user,
      type: 'text',
      text: 'قبل',
      status: 'sent',
      createdAt: '2026-10-08T11:00:00.000Z',
    };
    const latest: Message = {
      id: '33333333-3333-4333-8333-333333333333',
      conversationId: room,
      senderId: user,
      type: 'text',
      text: 'بعد',
      status: 'sent',
      createdAt: '2026-10-08T12:00:00.000Z',
    };
    const pending: Message = { ...latest, id: '44444444-4444-4444-8444-444444444444', text: 'انتظار', status: 'pending' };
    const merged = mergeHomeMessages([older, pending], [latest], [room], [room]);
    expect(merged.map((message) => message.text)).toEqual(['قبل', 'بعد', 'انتظار']);
  });

  it('keeps reactions and who has seen the room', () => {
    const messageId = '33333333-3333-4333-8333-333333333333';
    const other = '22222222-2222-4222-8222-222222222222';
    const payload = {
      messages: [{
        id: messageId,
        conversationId: room,
        senderId: user,
        text: 'مرحبا',
        createdAt: '2026-10-08T12:00:00.000Z',
        deleted: false,
        reactions: [{ emoji: '❤️', userId: other }, { emoji: 'nope', userId: 'local' }],
      }],
      readers: [{ userId: other, messageId, readAt: '2026-10-08T12:01:00.000Z' }, { userId: 'local' }],
    };
    expect(readRoomMessages(payload, room)?.[0]?.reactions).toEqual([{ emoji: '❤️', userId: other }]);
    expect(readRoomReaders(payload)).toEqual([{ userId: other, messageId, readAt: '2026-10-08T12:01:00.000Z' }]);
  });

  it('reads a private room opened from the server', () => {
    const other = '22222222-2222-4222-8222-222222222222';
    const opened = readOpenedRoom({
      conversation: {
        id: '44444444-4444-4444-8444-444444444444',
        type: 'private',
        participantIds: [user, other],
        unreadCount: 0,
        createdAt: '2026-10-08T12:00:00.000Z',
      },
      users: [
        { id: user, displayName: 'نورة', username: 'نورة', role: 'member', bio: '' },
        { id: other, displayName: 'ليلى', username: 'ليلى', role: 'member', bio: '' },
      ],
    });
    expect(opened?.conversation.type).toBe('private');
    expect(opened?.users).toHaveLength(2);
  });

  it('reads a stored image without its bytes', () => {
    const parsed = readRoomMessages({
      messages: [{
        id: '33333333-3333-4333-8333-333333333333',
        conversationId: room,
        senderId: user,
        text: '',
        type: 'image',
        fileSize: 4,
        createdAt: '2026-10-08T12:00:00.000Z',
        deleted: false,
      }],
    }, room);
    expect(parsed?.[0]?.type).toBe('image');
    expect(parsed?.[0]?.media?.state).toBe('remote');
    expect(parsed?.[0]?.media?.fileSize).toBe(4);
    expect(parsed?.[0]?.text).toBe('');
  });

  it('reads a stored file name without its bytes', () => {
    const parsed = readRoomMessages({
      messages: [{
        id: '33333333-3333-4333-8333-333333333333',
        conversationId: room,
        senderId: user,
        text: '',
        type: 'file',
        fileName: 'notes/a.txt',
        fileSize: 5,
        createdAt: '2026-10-08T12:00:00.000Z',
        deleted: false,
      }],
    }, room);
    expect(parsed?.[0]?.type).toBe('file');
    expect(parsed?.[0]?.media?.fileName).toBe('notes/a.txt');
    expect(parsed?.[0]?.media?.fileSize).toBe(5);
    expect(parsed?.[0]?.media?.state).toBe('remote');
  });

  it('reads an image as the latest home message', () => {
    const home = readHomePayload({
      conversations: [{
        id: room,
        type: 'global',
        name: 'ChatX',
        participantIds: [user],
        unreadCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        lastMessage: {
          id: '33333333-3333-4333-8333-333333333333',
          senderId: user,
          text: '',
          type: 'image',
          createdAt: '2026-10-08T12:00:00.000Z',
          deleted: false,
        },
      }],
      users: [{ id: user, displayName: 'نورة', username: 'نورة', role: 'member', bio: '' }],
    });
    expect(home?.messages[0]?.type).toBe('image');
  });

  it('rejects a list without the main room', () => {
    expect(readHomePayload({
      conversations: [{ id: room, type: 'private', participantIds: [user], unreadCount: 0, createdAt: '2026-01-01T00:00:00.000Z' }],
      users: [],
    })).toBeNull();
  });

  it('keeps the group turn on the conversation', () => {
    const group = '44444444-4444-4444-8444-444444444444';
    const next = '22222222-2222-4222-8222-222222222222';
    const saved = readUpdatedRoom({
      conversation: {
        id: group,
        type: 'group',
        name: 'المساء',
        participantIds: [user, next],
        unreadCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        turnUserId: next,
        turnOpensAt: '2026-10-15T12:00:00.000Z',
      },
    });
    expect(saved?.conversation.turnUserId).toBe(next);
    expect(saved?.conversation.turnOpensAt).toBe('2026-10-15T12:00:00.000Z');
    const now = Date.parse('2026-10-08T12:00:00.000Z');
    expect(canTakeGroupTurn(next, saved?.conversation ?? { participantIds: [] }, now)).toBe(false);
    expect(canTakeGroupTurn(user, saved?.conversation ?? { participantIds: [] }, now)).toBe(false);
    expect(canTakeGroupTurn(next, saved?.conversation ?? { participantIds: [] }, Date.parse('2026-10-15T12:00:00.000Z'))).toBe(true);
    expect(canTakeGroupTurn(next, saved?.conversation ?? { participantIds: [] }, Date.parse('2026-10-22T11:59:59.999Z'))).toBe(true);
    expect(canTakeGroupTurn(next, saved?.conversation ?? { participantIds: [] }, Date.parse('2026-10-22T12:00:00.000Z'))).toBe(false);
    expect(canTakeGroupTurn('outsider', { participantIds: [user] }, now)).toBe(false);
  });
});
