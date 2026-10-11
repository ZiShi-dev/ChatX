import { expect, it } from 'vitest';
import { activeMention, mentionPieces, mentionTone, mentionedHandles, mentionRecipients } from './mention';

it('expands custom roles with multiple words to their members for encrypted notification hints', () => {
  const people = [
    { id: 'alice', username: 'Alice', customRoleLabel: 'حراس اليشم' },
    { id: 'bob', username: 'Bob', customRoleLabel: 'حراس اليشم' },
    { id: 'other', username: 'Other', customRoleLabel: 'حراس' },
  ];
  expect(mentionRecipients('@حراس اليشم مرحبا @Alice', people)).toEqual({ mentions: ['alice', 'bob'], everyone: false, signal: false });
  expect(mentionRecipients('mail@حراس اليشم', people).mentions).toEqual([]);
  expect(mentionRecipients('@حراس اليشمx', people).mentions).toEqual(['other']);
});

it('supports everyone, direct mentions and administrative roles without inventing recipients', () => {
  const people = [{ id: 'a', username: 'Alice', role: 'admin' }, { id: 'b', username: 'Bob', role: 'member' }];
  expect(mentionRecipients('@everyone @admin @Bob', people)).toEqual({ mentions: ['a', 'b'], everyone: true, signal: false });
  expect(mentionRecipients('Bonjour', people).mentions).toEqual([]);
});

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
