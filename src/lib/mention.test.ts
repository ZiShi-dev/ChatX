import { expect, it } from 'vitest';
import { activeMention, mentionPieces, mentionTone, mentionedHandles } from './mention';

it('keeps every word of a name inside one mention', () => {
  const name = 'الخالد الامبراطوري';
  const text = `@${name} مرحبا`;
  expect(mentionedHandles(text, [name, 'عمر'])).toEqual([name]);
  expect(mentionTone(text, name)).toBe('direct');
  expect(mentionPieces(text, [name]).map((piece) => piece.text)).toEqual([`@${name}`, ' مرحبا']);
});

it('counts a second mention as well as the first', () => {
  const text = '@عمر @الخالد الامبراطوري';
  expect(mentionedHandles(text, ['عمر', 'الخالد الامبراطوري'])).toEqual(['عمر', 'الخالد الامبراطوري']);
});

it('keeps the mention list open while the second word is typed', () => {
  const draft = '@الخالد الام';
  expect(activeMention(draft, draft.length)?.query).toBe('الخالد الام');
});
