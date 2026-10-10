import { describe, expect, it } from 'vitest';
import {
  MESSAGE_FONT_OPTIONS,
  USER_COLOR_OPTIONS,
  bubbleStyleForUser,
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
    expect(bubbleStyleForUser('#4d7ea8', true, 'clear').className).toBe('has-user-style');
  });

  it('exposes every palette color and font option', () => {
    expect(USER_COLOR_OPTIONS.length).toBeGreaterThanOrEqual(8);
    expect(MESSAGE_FONT_OPTIONS.map((item) => item.id)).toEqual(['system', 'clear', 'rounded', 'classic']);
    expect(fontLabel('rounded')).toBe('ناعم');
    expect(messageFontFamily('system')).toBeUndefined();
    expect(messageFontFamily('classic')).toContain('Georgia');
  });

  it('styles incoming and outgoing bubbles differently', () => {
    const incoming = bubbleStyleForUser('#c4893a', false, 'clear');
    const outgoing = bubbleStyleForUser('#c4893a', true, 'clear');
    expect(incoming.style.borderColor).toBe('#c4893a');
    expect(outgoing.style.borderColor).toBe('#c4893a');
    expect(incoming.style.fontFamily).toContain('Tahoma');
    expect(String(outgoing.style.background)).toContain('58%');
    expect(String(incoming.style.background)).toContain('20%');
    expect(outgoing.style.color).toBeTruthy();
    expect(incoming.style.color).toBeFalsy();
  });
});
