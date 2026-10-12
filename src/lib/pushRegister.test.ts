import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushNotifications } from '@capacitor/push-notifications';
import { adminFetch } from './adminApi';
import { fcmEnabled } from './fcmEnabled';
import { useSettingsStore } from '../stores/settingsStore';
import {
  fcmPushAlertsActive,
  hasFcmToken,
  onPushTokenReady,
  resetPushRegistrationForTests,
  startPushRegistration,
  stopPushRegistration,
  syncPushPrefs,
} from './pushRegister';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}));

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    requestPermissions: vi.fn(async () => ({ receive: 'granted' })),
    checkPermissions: vi.fn(async () => ({ receive: 'granted' })),
    addListener: vi.fn(async () => ({ remove: async () => undefined })),
    register: vi.fn(async () => undefined),
    removeAllListeners: vi.fn(async () => undefined),
    createChannel: vi.fn(async () => undefined),
    removeAllDeliveredNotifications: vi.fn(async () => undefined),
  },
}));

vi.mock('./adminApi', () => ({
  adminFetch: vi.fn(async () => ({ pushEnabled: true })),
}));

vi.mock('./fcmEnabled', () => ({
  fcmEnabled: vi.fn(() => true),
}));

describe('pushRegister', () => {
  it('preserves data-only titles and bodies for foreground banners', async () => {
    await startPushRegistration('11111111-1111-4111-8111-111111111111');
    const handler = vi.mocked(PushNotifications.addListener).mock.calls.find(call => String(call[0]) === 'pushNotificationReceived')![1] as (event: unknown) => void;
    const received = vi.fn();
    window.addEventListener('chatx-push-received', received);
    try {
      handler({ data: { title: 'Alice', body: 'Hello', messageId: 'message' } });
      expect((received.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ title: 'Alice', body: 'Hello' });
    } finally { window.removeEventListener('chatx-push-received', received); }
  });
  const originalTypes = useSettingsStore.getState().notifyTypes;
  afterEach(() => { resetPushRegistrationForTests(); vi.useRealTimers(); useSettingsStore.setState({ notifyTypes: originalTypes }); });
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

  it('recovers from native registration setup failures instead of staying stuck', async () => {
    vi.useFakeTimers();
    vi.mocked(PushNotifications.createChannel).mockRejectedValueOnce(new Error('temporarily unavailable'));
    await expect(startPushRegistration('11111111-1111-4111-8111-111111111111')).rejects.toThrow();
    expect(hasFcmToken()).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(PushNotifications.register).toHaveBeenCalledOnce();
    await stopPushRegistration();
  });

  it('recovers when notification permission is granted later without restarting the app', async () => {
    vi.mocked(PushNotifications.requestPermissions).mockResolvedValueOnce({ receive: 'denied' });
    await startPushRegistration('11111111-1111-4111-8111-111111111111');
    expect(PushNotifications.register).not.toHaveBeenCalled();
    syncPushPrefs();
    await vi.waitFor(() => expect(PushNotifications.register).toHaveBeenCalledOnce());
  });

  it('retries asynchronous Firebase token failures with backoff', async () => {
    vi.useFakeTimers();
    await startPushRegistration('11111111-1111-4111-8111-111111111111');
    const calls = vi.mocked(PushNotifications.addListener).mock.calls as unknown as Array<[string, () => void]>;
    calls.find(call => call[0] === 'registrationError')![1]();
    await vi.advanceTimersByTimeAsync(5000);
    expect(PushNotifications.register).toHaveBeenCalledTimes(2);
    expect(hasFcmToken()).toBe(false);
  });

  it('sends the latest preferences when they change during registration', async () => {
    let release!: (value: unknown) => void;
    let first = true;
    vi.mocked(adminFetch).mockImplementation(async path => {
      if (path === '/api/push/register') return { pushEnabled: true };
      if (path === '/api/push/prefs' && first) { first = false; return new Promise(resolve => { release = resolve; }); }
      return {};
    });
    await startPushRegistration('11111111-1111-4111-8111-111111111111');
    const calls = vi.mocked(PushNotifications.addListener).mock.calls as unknown as Array<[string, (event: { value: string }) => void]>;
    calls.find(call => call[0] === 'registration')![1]({ value: 'preference-device-token-1234567890' });
    await vi.waitFor(() => expect(release).toBeDefined());
    useSettingsStore.setState({ notifyTypes: { ...originalTypes, message: false } });
    release({});
    await vi.waitFor(() => {
      const writes = vi.mocked(adminFetch).mock.calls.filter(([path]) => path === '/api/push/prefs');
      expect(JSON.parse(String(writes.at(-1)![1]!.body)).hiddenKinds.split(',')).toContain('message');
    });
    expect(hasFcmToken()).toBe(true);
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

  it('keeps the confirmed token when preference sync fails', async () => {
    vi.mocked(adminFetch).mockImplementation(async (path) => {
      if (path === '/api/push/register') return { pushEnabled: true };
      throw new Error('offline');
    });
    await startPushRegistration('11111111-1111-4111-8111-111111111111');
    const calls = vi.mocked(PushNotifications.addListener).mock.calls as unknown as Array<[string, (event: { value: string }) => void]>;
    vi.mocked(adminFetch).mockClear();
    calls.find((call) => call[0] === 'registration')![1]({ value: 'device-token-12345678901234567890' });
    await vi.waitFor(() => expect(hasFcmToken()).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(hasFcmToken()).toBe(true);
    expect(fcmPushAlertsActive()).toBe(true);
    expect(vi.mocked(adminFetch).mock.calls.filter(([path]) => path === '/api/push/register')).toHaveLength(1);
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
