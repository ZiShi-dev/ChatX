import { describe, expect, it } from 'vitest';
import { applyReaction, groupReactions, removeReaction } from './reactions';

describe('applyReaction', () => {
  it('keeps several different reactions from the same person', () => {
    const first = applyReaction([], 'me', '👍');
    expect(first).toEqual([{ emoji: '👍', userId: 'me' }]);
    expect(applyReaction(first, 'me', '❤️')).toEqual([
      { emoji: '👍', userId: 'me' },
      { emoji: '❤️', userId: 'me' },
    ]);
  });

  it('ignores choosing the same emoji again', () => {
    const current = [{ emoji: '❤️', userId: 'me' }];
    expect(applyReaction(current, 'me', '❤️')).toEqual(current);
  });

  it('removes only the chosen emoji', () => {
    const current = [
      { emoji: '👍', userId: 'me' },
      { emoji: '❤️', userId: 'me' },
      { emoji: '👍', userId: 'other' },
    ];
    expect(removeReaction(current, 'me', '👍')).toEqual([
      { emoji: '❤️', userId: 'me' },
      { emoji: '👍', userId: 'other' },
    ]);
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