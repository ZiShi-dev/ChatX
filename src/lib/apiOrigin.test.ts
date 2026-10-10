import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiOrigin, isValidApiOrigin, readStoredApiOrigin, saveApiOrigin } from './apiOrigin';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));

afterEach(() => {
  localStorage.removeItem('chatx.apiOrigin');
});

describe('apiOrigin', () => {
  it('accepts https origins with a port', () => {
    expect(isValidApiOrigin('https://10.145.239.228:8443')).toBe(true);
    expect(isValidApiOrigin('http://10.145.239.228:8443')).toBe(false);
  });

  it('prefers a stored origin over the build-time default', () => {
    saveApiOrigin('https://chat.example.com:8443');
    expect(readStoredApiOrigin()).toBe('https://chat.example.com:8443');
    expect(getApiOrigin()).toBe('https://chat.example.com:8443');
  });
});
