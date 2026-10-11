import { afterEach, describe, expect, it, vi } from 'vitest';
import { fcmEnabled } from './fcmEnabled';

describe('fcmEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is false unless VITE_ENABLE_FCM is true', () => {
    vi.stubEnv('VITE_ENABLE_FCM', 'false');
    expect(fcmEnabled()).toBe(false);
    vi.stubEnv('VITE_ENABLE_FCM', 'true');
    expect(fcmEnabled()).toBe(true);
  });
});
