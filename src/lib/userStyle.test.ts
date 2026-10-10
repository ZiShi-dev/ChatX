import { describe, expect, it } from 'vitest';
import {
  MESSAGE_FONT_OPTIONS,
  USER_COLOR_OPTIONS,
  displayNameStyleForUser,
  fontLabel,
  messageFontFamily,
  sanitizeMessageFont,
  sanitizeUserColor,
} from './userStyle';

describe('userStyle', () => {
  it('keeps palette colors and fonts', () => {
    expect(sanitizeUserColor('#zzzzzz')).toBe('#3d9b84');
    expect(sanitizeUserColor('#4d7ea8')).toBe('#4d7ea8');
    expect(sanitizeUserColor('#FFFFFF', '#6f8f72')).toBe('#6f8f72');
    expect(sanitizeMessageFont('classic')).toBe('classic');
    expect(sanitizeMessageFont('bad')).toBe('system');
    expect(displayNameStyleForUser('#4d7ea8', 'clear').className).toBe('has-user-display');
  });

  it('exposes every palette color and font option', () => {
    expect(USER_COLOR_OPTIONS.length).toBe(12);
    expect(MESSAGE_FONT_OPTIONS.map((item) => item.id)).toEqual(['system', 'clear', 'rounded', 'classic']);
    expect(fontLabel('rounded')).toBe('ناعم');
    expect(messageFontFamily('system')).toBeUndefined();
    expect(messageFontFamily('classic')).toContain('Georgia');
  });

  it('styles only the display name, not bubble colors', () => {
    const look = displayNameStyleForUser('#c4893a', 'clear');
    expect(look.style.color).toBe('#c4893a');
    expect(look.style.fontFamily).toContain('Tahoma');
    expect(look.style).not.toHaveProperty('background');
    expect(look.style).not.toHaveProperty('borderColor');
  });
});
