import { describe, expect, it } from 'vitest';
import { typingLabel } from './typing';

describe('typingLabel', () => {
  it('formats one or many writers', () => {
    expect(typingLabel([])).toBe('');
    expect(typingLabel(['أحمد'])).toBe('أحمد يكتب…');
    expect(typingLabel(['أحمد', 'سارة'])).toBe('أحمد وسارة يكتبان…');
    expect(typingLabel(['أ', 'ب', 'ج'])).toBe('3 أشخاص يكتبون…');
  });
});
