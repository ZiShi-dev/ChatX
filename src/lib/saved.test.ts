import { describe, expect, it } from 'vitest';
import { readSavedPayload, savedFor, toSavedEntry, toggleSaved, type SavedEntry } from './saved';
import type { Message } from '../types/message';

const message = (patch: Partial<Message> & Pick<Message, 'id' | 'type'>): Message => ({
  conversationId: 'c-famille',
  senderId: 'chloe',
  status: 'sent',
  createdAt: '2026-10-08T10:00:00.000Z',
  ...patch,
});

describe('saved messages', () => {
  it('records every message type for the user who saves it', () => {
    const types = [
      message({ id: 't', type: 'text', text: 'الأحد يناسبني.' }),
      message({ id: 'i', type: 'image', media: { fileSize: 10, state: 'remote' } }),
      message({ id: 'v', type: 'video', media: { fileSize: 20, state: 'cached', duration: 4 } }),
      message({ id: 'l', type: 'link', link: { url: 'https://example.com', preview: 'loaded', title: 'مثال' } }),
      message({ id: 'f', type: 'file', media: { fileName: 'note.pdf', fileSize: 30, state: 'remote' } }),
    ];
    let entries: SavedEntry[] = [];
    types.forEach((item) => {
      const entry = toSavedEntry(item, 'me', 'Famille', 'Chloé');
      expect(entry).not.toBeNull();
      entries = toggleSaved(entries, entry!);
    });
    expect(savedFor(entries, 'me').map((item) => item.type)).toEqual(['file', 'link', 'video', 'image', 'text']);
    expect(savedFor(entries, 'other')).toEqual([]);
  });

  it('removes a message when the same user saves it again', () => {
    const entry = toSavedEntry(message({ id: 't', type: 'text', text: 'مرحبا' }), 'me', 'Famille', 'Chloé', '2026-10-08T11:00:00.000Z');
    const once = toggleSaved([], entry!);
    expect(toggleSaved(once, entry!)).toEqual([]);
  });

  it('reads a saved text message from the server', () => {
    const messageId = '33333333-3333-4333-8333-333333333333';
    const room = '00000000-0000-4000-8000-000000000001';
    const sender = '22222222-2222-4222-8222-222222222222';
    const items = readSavedPayload({
      saved: [{
        messageId,
        conversationId: room,
        conversationName: 'ChatX',
        senderId: sender,
        senderName: 'ليلى',
        type: 'text',
        preview: 'مرحبا',
        createdAt: '2026-10-08T12:00:00.000Z',
        savedAt: '2026-10-08T12:05:00.000Z',
      }],
    }, '11111111-1111-4111-8111-111111111111');
    expect(items?.[0]?.preview).toBe('مرحبا');
    expect(items?.[0]?.conversationName).toBe('ChatX');
    expect(readSavedPayload({ saved: [{ messageId, type: 'image' }] }, 'me')).toBeNull();
  });

  it('does not record a deleted message', () => {
    expect(toSavedEntry(message({ id: 'gone', type: 'text', text: 'x', deletedForEveryone: true }), 'me', 'Famille', 'Chloé')).toBeNull();
  });
});
