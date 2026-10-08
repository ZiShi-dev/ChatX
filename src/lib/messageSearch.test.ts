import { describe, expect, it } from 'vitest';
import type { Message } from '../types/message';
import { searchMessages } from './messageSearch';

const message = (id: string, text: string): Message => ({
  id,
  conversationId: 'c-famille',
  senderId: 'chloe',
  type: 'text',
  text,
  status: 'sent',
  createdAt: '2026-10-08T10:00:00.000Z',
});

describe('searchMessages', () => {
  it('finds a message by its text and keeps the newest first', () => {
    const hits = searchMessages(
      [message('old', 'نلتقي يوم الأحد'), message('new', 'رائع، نثبت الأحد')],
      'الأحد',
    );
    expect(hits.map((item) => item.id)).toEqual(['new', 'old']);
  });

  it('returns nothing for a blank search', () => {
    expect(searchMessages([message('old', 'نلتقي')], '  ')).toEqual([]);
  });
});
