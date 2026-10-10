import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boundedSnapshot, loadChatSnapshot, saveChatSnapshot, type ChatSnapshot } from './chatCache';
import { mergeRoomWindow } from './chatWindow';
import type { Message } from '../types/message';

const message = (id: number, status: Message['status'] = 'sent'): Message => ({ id: String(id).padStart(5, '0'), conversationId: 'room', senderId: 'alice', type: 'text', text: 'hello', createdAt: '2026-10-09T12:00:00Z', status });
const snapshot = (messages: Message[]): ChatSnapshot => ({ conversations: [{ id: 'room', type: 'private', participantIds: ['alice', 'bob'], unreadCount: 0 }], users: [], messages });
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
describe('durable account cache', () => {
  it('restores pending sends after restart and separates accounts', () => {
    saveChatSnapshot('alice', snapshot([message(1, 'sending')]));
    expect(loadChatSnapshot('alice')?.messages[0].status).toBe('pending');
    expect(loadChatSnapshot('charlie')).toBeNull();
  });
  it('bounds history, retains durable attachments, and strips sent previews', () => {
    const image: Message = { ...message(500, 'pending'), type: 'image', media: { fileName: 'a.jpg', fileSize: 3, state: 'cached', localPreviewUrl: 'data:image/jpeg;base64,/9j/' } };
    const result = boundedSnapshot(snapshot([...Array.from({ length: 450 }, (_, i) => message(i)), image, { ...image, id: 'sent', status: 'sent' }]));
    expect(result.messages).toHaveLength(301);
    expect(result.messages.find((item) => item.id === image.id)?.media?.localPreviewUrl).toBe(image.media?.localPreviewUrl);
    expect(result.messages.find((item) => item.id === 'sent')?.media?.localPreviewUrl).toBeUndefined();
  });
  it('rejects foreign-room cache and surfaces full storage before sending', () => {
    localStorage.setItem('chatx.chat.v1.charlie', JSON.stringify(snapshot([message(1)])));
    expect(loadChatSnapshot('charlie')).toBeNull();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => saveChatSnapshot('alice', snapshot([message(1, 'pending')]))).toThrow('quota');
    expect(() => boundedSnapshot(snapshot(Array.from({ length: 41 }, (_, i) => message(i, 'pending'))))).toThrow('outbox_full');
  });
});
describe('bounded room window', () => {
  it('advances through older history without gaps or unbounded growth', () => {
    const current = Array.from({ length: 300 }, (_, i) => message(i + 30));
    const merged = mergeRoomWindow(current, Array.from({ length: 30 }, (_, i) => message(i)), 'room', 'older');
    expect(merged).toHaveLength(300); expect(merged[0].id).toBe('00000'); expect(merged.at(-1)?.id).toBe('00299');
  });
  it('replaces disconnected latest/context pages and preserves pending sends', () => {
    const pending = message(999, 'pending');
    const merged = mergeRoomWindow([message(1), pending], [message(500)], 'room', 'latest');
    expect(merged.map((item) => item.id)).toEqual(['00500', '00999']);
    expect(mergeRoomWindow(merged, [message(20)], 'room', 'around').map((item) => item.id)).toEqual(['00020', '00500', '00999']);
  });
});
