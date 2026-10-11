import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PushNotifications } from '@capacitor/push-notifications';
import { adminFetch } from './adminApi';
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
    createChannel: vi.fn(async () => undefined),
  },
}));

vi.mock('./adminApi', () => ({
  adminFetch: vi.fn(async () => ({ pushEnabled: true })),
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
    vi.mocked(adminFetch).mockResolvedValue({ pushEnabled: true });
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

  it('keeps inbox fallback until the server confirms FCM', async () => {
    vi.mocked(adminFetch).mockResolvedValue({ pushEnabled: false });
    await startPushRegistration('11111111-1111-4111-8111-111111111111');
    const calls = vi.mocked(PushNotifications.addListener).mock.calls as unknown as Array<
      [string, (event: { value: string }) => void | Promise<void>]
    >;
    await calls.find((call) => call[0] === 'registration')![1]({ value: 'device-token-12345678901234567890' });
    await vi.waitFor(() => expect(vi.mocked(adminFetch)).toHaveBeenCalled());
    expect(hasFcmToken()).toBe(false);
    expect(fcmPushAlertsActive()).toBe(false);
  });

  it('does not disable fallback while device registration is still in flight', async () => {
    let confirm!: (value: unknown) => void;
    vi.mocked(adminFetch).mockImplementation(async (path) => path === '/api/push/register' ? new Promise(resolve => { confirm = resolve; }) : {});
    await startPushRegistration('11111111-1111-4111-8111-111111111111');
    const calls = vi.mocked(PushNotifications.addListener).mock.calls as unknown as Array<[string, (event: { value: string }) => void]>;
    const registration = calls.find(call => call[0] === 'registration')!;
    (registration[1] as (event: { value: string }) => void)({ value: 'pending-device-token-1234567890' });
    expect(fcmPushAlertsActive()).toBe(false);
    confirm({ pushEnabled: true });
    await vi.waitFor(() => expect(fcmPushAlertsActive()).toBe(true));
    await stopPushRegistration();
  });

  it('does not reactivate a signed-out device when a delayed confirmation arrives', async () => {
    let confirm!: (value: unknown) => void;
    vi.mocked(adminFetch).mockImplementation(async (path) => path === '/api/push/register' ? new Promise(resolve => { confirm = resolve; }) : {});
    await startPushRegistration('11111111-1111-4111-8111-111111111111');
    const calls = vi.mocked(PushNotifications.addListener).mock.calls as unknown as Array<[string, (event: { value: string }) => void]>;
    const registration = calls.find(call => call[0] === 'registration')!;
    (registration[1] as (event: { value: string }) => void)({ value: 'pending-device-token-1234567890' });
    await stopPushRegistration();
    confirm({ pushEnabled: true });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fcmPushAlertsActive()).toBe(false);
  });
});
