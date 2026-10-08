import { describe, expect, it } from 'vitest';
import type { Message } from '../types/message';
import type { User } from '../types/user';
import { advanceCursor, facesOnMessage, hasSeenMessage, noteReadTime, seenAtFor } from './readReceipts';

const message = (id: string, createdAt: string, senderId = 'me'): Message => ({
  id,
  conversationId: 'c-equipe',
  senderId,
  type: 'text',
  status: 'sent',
  createdAt,
});

const messages = [message('old', '2026-01-01T00:00:00.000Z'), message('new', '2026-01-02T00:00:00.000Z')];

describe('read receipts', () => {
  it('uses the message ID to distinguish reads at the same timestamp', () => {
    const tied = [message('a', '2026-01-01T00:00:00Z'), message('b', '2026-01-01T00:00:00Z')];
    expect(hasSeenMessage('a', tied, 'b')).toBe(false);
    expect(hasSeenMessage('b', tied, 'a')).toBe(true);
    expect(advanceCursor({ 'c-equipe': { amina: 'a' } }, tied, 'c-equipe', 'amina', 'b')['c-equipe'].amina).toBe('b');
  });
  it('moves a cursor forward and ignores an older message', () => {
    const once = advanceCursor({}, messages, 'c-equipe', 'amina', 'old');
    const next = advanceCursor(once, messages, 'c-equipe', 'amina', 'new');
    const stuck = advanceCursor(next, messages, 'c-equipe', 'amina', 'old');
    expect(next['c-equipe'].amina).toBe('new');
    expect(stuck).toBe(next);
  });

  it('treats every message up to the cursor as seen', () => {
    expect(hasSeenMessage('new', messages, 'old')).toBe(true);
    expect(hasSeenMessage('old', messages, 'new')).toBe(false);
  });

  it('places a face only on the message where that person stopped', () => {
    const users = new Map<string, User>([
      ['amina', { id: 'amina', username: 'amina', displayName: 'Amina', role: 'member', status: 'online', bio: '', color: '#000' }],
    ]);
    expect(facesOnMessage({ amina: 'new' }, messages[1], 'me', users).map((user) => user.id)).toEqual(['amina']);
    expect(facesOnMessage({ amina: 'new' }, messages[0], 'me', users)).toEqual([]);
  });

  it('keeps the time when someone sees a message', () => {
    const once = advanceCursor({}, messages, 'c-equipe', 'amina', 'old');
    const times = noteReadTime({}, {}, once, 'c-equipe', 'amina', '2026-01-01T00:05:00.000Z');
    const next = advanceCursor(once, messages, 'c-equipe', 'amina', 'new');
    const later = noteReadTime(times, once, next, 'c-equipe', 'amina', '2026-01-02T00:05:00.000Z');
    expect(seenAtFor('new', later['c-equipe'].amina, messages, 'old')).toBe('2026-01-02T00:05:00.000Z');
    expect(seenAtFor('old', times['c-equipe'].amina, messages, 'new')).toBeUndefined();
    expect(noteReadTime(later, next, next, 'c-equipe', 'amina', '2026-01-03T00:00:00.000Z')).toBe(later);
  });
});
