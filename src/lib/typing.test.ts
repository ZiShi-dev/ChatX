import { describe, expect, it } from 'vitest';
import { useSettingsStore } from '../stores/settingsStore';
import { typingLabel } from './typing';

describe('typingLabel', () => {
  it('formats one or many writers in Arabic', () => {
    useSettingsStore.getState().setLocale('ar');
    expect(typingLabel([])).toBe('');
    expect(typingLabel(['أحمد'])).toBe('أحمد يكتب…');
    expect(typingLabel(['أحمد', 'سارة'])).toBe('أحمد وسارة يكتبان…');
    expect(typingLabel(['أ', 'ب', 'ج'])).toBe('3 أشخاص يكتبون…');
  });

  it('formats one writer in English', () => {
    useSettingsStore.getState().setLocale('en');
    expect(typingLabel(['Alice'])).toBe('Alice is typing…');
  });
});
