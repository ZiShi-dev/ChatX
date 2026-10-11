import { describe, expect, it } from 'vitest';
import { customRoleReady, parseCustomRoleColors, sanitizeCustomRoleLabel } from './customRole';

describe('customRole', () => {
  it('parses role colors from API arrays', () => {
    expect(parseCustomRoleColors(['#112233', '#aabbcc'])).toEqual(['#112233', '#aabbcc']);
    expect(parseCustomRoleColors(['bad'])).toEqual([]);
  });

  it('requires label and colors for display', () => {
    expect(customRoleReady({ customRoleLabel: '  حارس  ', customRoleColors: ['#112233'] })?.label).toBe('حارس');
    expect(customRoleReady({ customRoleLabel: '', customRoleColors: ['#112233'] })).toBeNull();
  });

  it('trims label length', () => {
    expect(sanitizeCustomRoleLabel('a'.repeat(40)).length).toBe(32);
  });
});
