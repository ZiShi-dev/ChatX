import { describe, expect, it } from 'vitest';
import { applyReaction, groupReactions } from './reactions';

describe('applyReaction', () => {
  it('keeps one reaction per person and replaces it', () => {
    const first = applyReaction([], 'me', '👍');
    expect(first).toEqual([{ emoji: '👍', userId: 'me' }]);
    expect(applyReaction(first, 'me', '❤️')).toEqual([{ emoji: '❤️', userId: 'me' }]);
  });

  it('removes the reaction when the same emoji is chosen again', () => {
    expect(applyReaction([{ emoji: '❤️', userId: 'me' }], 'me', '❤️')).toEqual([]);
  });

  it('groups the same emoji together', () => {
    expect(
      groupReactions([
        { emoji: '👍', userId: 'chloe' },
        { emoji: '😂', userId: 'yanis' },
        { emoji: '👍', userId: 'mehdi' },
      ]),
    ).toEqual([
      { emoji: '👍', userIds: ['chloe', 'mehdi'] },
      { emoji: '😂', userIds: ['yanis'] },
    ]);
  });
});