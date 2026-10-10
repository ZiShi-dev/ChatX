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
    expect(sanitizeUserColor('#FFFFFF', '#6f8f72')).toBe('#ffffff');
    expect(sanitizeUserColor('#a1b2c3')).toBe('#a1b2c3');
    expect(sanitizeMessageFont('classic')).toBe('classic');
    expect(sanitizeMessageFont('bad')).toBe('system');
    expect(displayNameStyleForUser('#4d7ea8', 'clear').className).toContain('has-user-display');
    expect(displayNameStyleForUser('#4d7ea8', 'clear').className).toContain('is-name-font-clear');
  });

  it('exposes every palette color and font option', () => {
    expect(USER_COLOR_OPTIONS.length).toBe(12);
    expect(MESSAGE_FONT_OPTIONS.map((item) => item.id)).toEqual(['system', 'clear', 'rounded', 'classic']);
    expect(fontLabel('rounded')).toBe('ناعم');
    expect(messageFontFamily('system')).toBeUndefined();
    expect(messageFontFamily('classic')).toContain('ChatX Amiri');
  });

  it('styles only the display name, not bubble colors', () => {
    const look = displayNameStyleForUser('#c4893a', 'clear');
    expect(look.style.color).toBe('#c4893a');
    expect(look.className).toContain('is-name-font-clear');
    expect(look.style).not.toHaveProperty('background');
    expect(look.style).not.toHaveProperty('borderColor');
  });
});
