import { describe, expect, it, vi } from 'vitest';
import { recentEmoji, rememberEmoji, searchEmoji } from './emojiPicker';
import { EMOJI_GROUPS } from './emojiCatalog';

describe('emoji picker', () => {
  it('keeps recent emoji private per account, unique, and bounded', () => {
    const owner = crypto.randomUUID(); const other = crypto.randomUUID();
    EMOJI_GROUPS[0].emojis.slice(0, 30).forEach(emoji => rememberEmoji(owner, emoji));
    rememberEmoji(owner, '😂'); rememberEmoji(owner, '😂');
    expect(recentEmoji(owner)).toHaveLength(24);
    expect(recentEmoji(owner)[0]).toBe('😂');
    expect(new Set(recentEmoji(owner)).size).toBe(24);
    expect(recentEmoji(other)).toEqual([]);
  });
  it('ignores invalid storage and never blocks a pick when storage is unavailable', () => {
    const owner = crypto.randomUUID(); localStorage.setItem(`chatx.emojiRecent.${owner}`, '{');
    expect(recentEmoji(owner)).toEqual([]);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    try { expect(() => rememberEmoji(owner, '😂')).not.toThrow(); } finally { spy.mockRestore(); }
  });
  it('searches Arabic and French without duplicate results or accent sensitivity', () => {
    expect(searchEmoji('ضحك')).toEqual(['🤣', '😂']);
    expect(searchEmoji('rire')).toEqual(['🤣', '😂']);
    expect(searchEmoji('téléphone')).toEqual(searchEmoji('telephone'));
    expect(searchEmoji('❤️')).toContain('❤️');
    const hearts = searchEmoji('coeur'); expect(hearts).toContain('💙');
    expect(new Set(hearts).size).toBe(hearts.length);
    expect(searchEmoji('zzunknown')).toEqual([]);
  });
});
