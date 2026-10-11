import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { adminFetch } from './adminApi';
import { fcmEnabled } from './fcmEnabled';
import { isServerId } from './home';
import { quietLevel, useMuteStore } from '../stores/muteStore';
import { useSettingsStore } from '../stores/settingsStore';

let token = '';
let started = false;
let candidate = '';
let generation = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryCount = 0;
let syncing: Promise<void> | undefined;
const tokenListeners = new Set<() => void>();

function emitTokenChange() {
  tokenListeners.forEach((listener) => listener());
}

export function hasFcmToken() {
  return token.length > 0;
}

export function fcmPushAlertsActive() {
  return fcmEnabled() && hasFcmToken();
}

export function onPushTokenReady(listener: () => void) {
  tokenListeners.add(listener);
  if (token) listener();
  return () => {
    tokenListeners.delete(listener);
  };
}

function pushPrefs() {
  const quiet = useMuteStore.getState().mutes.map((item) => `${item.conversationId}=${quietLevel(item)}`).join(',');
  const hiddenKinds = Object.entries(useSettingsStore.getState().notifyTypes)
    .filter(([, enabled]) => !enabled)
    .map(([kind]) => kind)
    .join(',');
  return { quiet, hiddenKinds };
}

async function syncPrefs() {
  if (!token) return;
  await adminFetch('/api/push/prefs', { method: 'POST', body: JSON.stringify(pushPrefs()) });
}

async function syncToken(value: string) {
  const lease = generation;
  const response = await adminFetch('/api/push/register', { method: 'POST', body: JSON.stringify({ token: value, platform: Capacitor.getPlatform() }) }) as { pushEnabled?: boolean };
  await adminFetch('/api/push/prefs', { method: 'POST', body: JSON.stringify(pushPrefs()) });
  if (!started || generation !== lease || candidate !== value) return;
  token = response.pushEnabled === true ? value : '';
  retryCount = 0;
  emitTokenChange();
}

function retrySync() {
  if (!started || !candidate || syncing) return;
  clearTimeout(retryTimer);
  const lease = generation;
  syncing = syncToken(candidate).catch(() => {
    if (lease !== generation || !started) return;
    token = '';
    emitTokenChange();
    retryTimer = setTimeout(retrySync, Math.min(60_000, 5000 * 2 ** Math.min(retryCount++, 4)));
  }).finally(() => { if (lease === generation) syncing = undefined; });
}

export async function startPushRegistration(userId: string) {
  if (!fcmEnabled() || !Capacitor.isNativePlatform() || !isServerId(userId) || started) return;
  started = true;
  const lease = ++generation;
  const permission = await PushNotifications.requestPermissions().catch(() => ({ receive: 'denied' }));
  if (lease !== generation) return;
  if (permission.receive !== 'granted') {
    started = false;
    return;
  }
  await PushNotifications.addListener('registration', (event) => {
    if (lease !== generation) return;
    candidate = event.value;
    retrySync();
  });
  await PushNotifications.addListener('registrationError', () => {
    if (lease !== generation) return;
    token = '';
    emitTokenChange();
  });
  await PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    const conversationId = event.notification.data?.conversationId;
    const messageId = event.notification.data?.messageId;
    if (typeof conversationId !== 'string' || !conversationId) return;
    const path = typeof messageId === 'string' && messageId ? `/chat/${conversationId}?at=${messageId}` : `/chat/${conversationId}`;
    window.dispatchEvent(new CustomEvent('chatx-push-open', { detail: { path } }));
  });
  await PushNotifications.addListener('pushNotificationReceived', (event) => {
    if (lease !== generation) return;
    window.dispatchEvent(new CustomEvent('chatx-push-received', { detail: event.data }));
  });
  if (Capacitor.getPlatform() === 'android') {
    await PushNotifications.createChannel({ id: 'chatx-messages', name: 'الرسائل', importance: 4, visibility: 1, vibration: true });
  }
  window.addEventListener('online', syncPushPrefs);
  await PushNotifications.register();
}

export function syncPushPrefs() {
  if (!token && candidate) retrySync();
  else void syncPrefs().catch(() => { token = ''; emitTokenChange(); retrySync(); });
}

export function resetPushRegistrationForTests() {
  token = '';
  started = false;
  candidate = '';
  generation++;
  clearTimeout(retryTimer);
  syncing = undefined;
  retryCount = 0;
  window.removeEventListener('online', syncPushPrefs);
  tokenListeners.clear();
}

export async function stopPushRegistration() {
  const current = token;
  token = '';
  started = false;
  candidate = '';
  generation++;
  clearTimeout(retryTimer);
  syncing = undefined;
  window.removeEventListener('online', syncPushPrefs);
  emitTokenChange();
  if (current) {
    await adminFetch('/api/push/unregister', { method: 'POST', body: JSON.stringify({ token: current }) }).catch(() => undefined);
    emitTokenChange();
  }
  await PushNotifications.removeAllListeners().catch(() => undefined);
}
