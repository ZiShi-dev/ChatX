import { afterEach, expect, it, vi } from 'vitest';
import { PushNotifications } from '@capacitor/push-notifications';
import { invalidateApiSession } from './adminApi';
import { hasFcmToken, resetPushRegistrationForTests, startPushRegistration, stopPushRegistration } from './pushRegister';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}));
vi.mock('./fcmEnabled', () => ({ fcmEnabled: () => true }));
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    requestPermissions: async () => ({ receive: 'granted' }),
    addListener: vi.fn(async () => ({ remove: async () => undefined })),
    register: async () => undefined,
    createChannel: async () => undefined,
    removeAllDeliveredNotifications: async () => undefined,
  },
}));

afterEach(() => {
  resetPushRegistrationForTests();
  invalidateApiSession();
  localStorage.removeItem('chatx.apiOrigin');
  localStorage.removeItem('chatx.session');
  vi.unstubAllGlobals();
});

it('registers, saves preferences and unregisters using JSON objects on the actual HTTP transport', async () => {
  localStorage.setItem('chatx.apiOrigin', 'https://push.example');
  localStorage.setItem('chatx.session', 's'.repeat(43));
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    requests.push({ url, body });
    // The server expects an object; a twice-encoded token fails authentication.
    if (!body || typeof body !== 'object') return Response.json({ error: 'invalid_credentials' }, { status: 401 });
    expect((init.headers as Headers).get('x-chatx-session')).toBe('s'.repeat(43));
    return Response.json({ ok: true, pushEnabled: true });
  }));
  await startPushRegistration('11111111-1111-4111-8111-111111111111');
  const handler = vi.mocked(PushNotifications.addListener).mock.calls.find(call => String(call[0]) === 'registration')![1] as unknown as (event: { value: string }) => void;
  const token = 'device-token-12345678901234567890';
  handler({ value: token });
  await vi.waitFor(() => expect(requests.some(request => request.url.endsWith('/prefs'))).toBe(true));
  expect(hasFcmToken()).toBe(true);
  await stopPushRegistration();
  expect(requests).toEqual([
    { url: 'https://push.example/api/push/register', body: { token, platform: 'android-data-v1' } },
    { url: 'https://push.example/api/push/prefs', body: { quiet: expect.any(String), hiddenKinds: expect.any(String) } },
    { url: 'https://push.example/api/push/unregister', body: { token } },
  ]);
});
