import { describe, expect, it } from 'vitest';
import { isSafeExternalUrl } from './url';

describe('isSafeExternalUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeExternalUrl('https://chatx.app/guide')).toBe(true);
    expect(isSafeExternalUrl('http://example.com')).toBe(true);
  });

  it('rejects other schemes and broken values', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalUrl('intent://scan/#Intent;end')).toBe(false);
    expect(isSafeExternalUrl('not a url')).toBe(false);
  });
});
