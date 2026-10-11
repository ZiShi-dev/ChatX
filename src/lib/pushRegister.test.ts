import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PushNotifications } from '@capacitor/push-notifications';
import { fcmEnabled } from './fcmEnabled';
import {
  fcmPushAlertsActive,
  hasFcmToken,
  onPushTokenReady,
  resetPushRegistrationForTests,
  startPushRegistration,
  stopPushRegistration,
} from './pushRegister';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}));

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    requestPermissions: vi.fn(async () => ({ receive: 'granted' })),
    addListener: vi.fn(async () => ({ remove: async () => undefined })),
    register: vi.fn(async () => undefined),
    removeAllListeners: vi.fn(async () => undefined),
  },
}));

vi.mock('./adminApi', () => ({
  adminFetch: vi.fn(async () => ({})),
}));

vi.mock('./fcmEnabled', () => ({
  fcmEnabled: vi.fn(() => true),
}));

describe('pushRegister', () => {
  beforeEach(() => {
    resetPushRegistrationForTests();
    vi.mocked(fcmEnabled).mockReturnValue(true);
    vi.mocked(PushNotifications.addListener).mockClear();
    vi.mocked(PushNotifications.register).mockClear();
  });

  it('tracks token readiness for inbox fallback', async () => {
    expect(fcmPushAlertsActive()).toBe(false);
    let ready = 0;
    onPushTokenReady(() => { ready += 1; });
    await startPushRegistration('11111111-1111-4111-8111-111111111111');
    const calls = vi.mocked(PushNotifications.addListener).mock.calls as unknown as Array<
      [string, (event: { value: string }) => void | Promise<void>]
    >;
    const registration = calls.find((call) => call[0] === 'registration');
    expect(registration).toBeDefined();
    await registration![1]({ value: 'device-token-12345678901234567890' });
    await vi.waitFor(() => expect(ready).toBeGreaterThan(0));
    expect(hasFcmToken()).toBe(true);
    expect(fcmPushAlertsActive()).toBe(true);
    await stopPushRegistration();
    expect(hasFcmToken()).toBe(false);
  });

  it('skips registration when FCM is disabled', async () => {
    vi.mocked(fcmEnabled).mockReturnValue(false);
    await startPushRegistration('11111111-1111-4111-8111-111111111111');
    expect(PushNotifications.register).not.toHaveBeenCalled();
  });
});
