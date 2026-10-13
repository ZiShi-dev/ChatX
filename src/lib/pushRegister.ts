import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { adminFetch } from './adminApi';
import { fcmEnabled } from './fcmEnabled';
import { isServerId } from './home';
import { quietLevel, useMuteStore } from '../stores/muteStore';
import { useSettingsStore } from '../stores/settingsStore';

let token = '';
let started = false;
let registrationUserId = '';
let candidate = '';
let generation = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryCount = 0;
let prefsRetry = 0;
let syncing: Promise<void> | undefined;
let prefsSyncing: Promise<void> | undefined;
const registrationHandles: Array<{ remove: () => Promise<void> }> = [];
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
  await persistPrefs();
}

function persistPrefs() {
  if (prefsSyncing) return prefsSyncing;
  const lease = generation;
  const pending = (async () => {
    while (started && lease === generation) {
      const body = pushPrefs();
      await adminFetch('/api/push/prefs', { method: 'POST', body });
      if (JSON.stringify(body) === JSON.stringify(pushPrefs())) return;
    }
  })();
  prefsSyncing = pending;
  void pending.finally(() => { if (prefsSyncing === pending) prefsSyncing = undefined; }).catch(() => undefined);
  return pending;
}

function schedulePrefsRetry() {
  clearTimeout(retryTimer);
  const lease = generation;
  retryTimer = setTimeout(() => {
    if (lease !== generation || !started || !token) return;
    void syncPrefs().catch(() => { if (lease === generation && started && token) schedulePrefsRetry(); });
  }, Math.min(60_000, 5000 * 2 ** Math.min(prefsRetry++, 4)));
}

async function syncToken(value: string) {
  const lease = generation;
  const platform = Capacitor.getPlatform() === 'android' ? 'android-data-v1' : Capacitor.getPlatform();
  const response = await adminFetch('/api/push/register', { method: 'POST', body: { token: value, platform } }) as { pushEnabled?: boolean };
  if (!started || generation !== lease || candidate !== value) return;
  token = response.pushEnabled === true ? value : '';
  retryCount = 0;
  prefsRetry = 0;
  emitTokenChange();
  if (!token) {
    retryTimer = setTimeout(retrySync, 60_000);
    return;
  }
  try {
    await persistPrefs();
  } catch {
    if (!started || generation !== lease || candidate !== value) return;
    schedulePrefsRetry();
  }
}

function retrySync() {
  if (!started || !candidate || syncing) return;
  clearTimeout(retryTimer);
  const lease = generation;
  const value = candidate;
  syncing = syncToken(value).catch(() => {
    if (lease !== generation || !started) return;
    token = '';
    emitTokenChange();
    retryTimer = setTimeout(retrySync, Math.min(60_000, 5000 * 2 ** Math.min(retryCount++, 4)));
  }).finally(() => {
    if (lease !== generation) return;
    syncing = undefined;
    if (candidate && candidate !== value) retrySync();
  });
}

export async function startPushRegistration(userId: string) {
  if (!fcmEnabled() || !Capacitor.isNativePlatform() || !isServerId(userId) || started) return;
  registrationUserId = userId;
  clearTimeout(retryTimer);
  started = true;
  const lease = ++generation;
  try {
  const own = (handle: { remove: () => Promise<void> }) => {
    if (lease !== generation) void handle.remove();
    else registrationHandles.push(handle);
  };
  const permission = await PushNotifications.requestPermissions().catch(() => ({ receive: 'denied' }));
  if (lease !== generation) return;
  if (permission.receive !== 'granted') {
    started = false;
    return;
  }
  own(await PushNotifications.addListener('registration', (event) => {
    if (lease !== generation) return;
    candidate = event.value;
    retrySync();
  }));
  own(await PushNotifications.addListener('registrationError', () => {
    if (lease !== generation) return;
    token = '';
    candidate = '';
    emitTokenChange();
    clearTimeout(retryTimer);
    retryTimer = setTimeout(syncPushPrefs, Math.min(60_000, 5000 * 2 ** Math.min(retryCount++, 4)));
  }));
  own(await PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    if (lease !== generation) return;
    const conversationId = event.notification.data?.conversationId;
    const messageId = event.notification.data?.messageId;
    if (typeof conversationId !== 'string' || !conversationId) return;
    const kind = event.notification.data?.kind;
    const path = typeof messageId === 'string' && messageId
      ? (kind === 'reaction' ? `/chat/${conversationId}?at=${messageId}&react=1` : `/chat/${conversationId}?at=${messageId}`)
      : `/chat/${conversationId}`;
    window.dispatchEvent(new CustomEvent('chatx-push-open', { detail: { path } }));
  }));
  own(await PushNotifications.addListener('pushNotificationReceived', (event) => {
    if (lease !== generation) return;
    window.dispatchEvent(new CustomEvent('chatx-push-received', { detail: { ...event.data, title: event.title ?? event.data?.title, body: event.body ?? event.data?.body } }));
  }));
  if (lease !== generation) return;
  if (Capacitor.getPlatform() === 'android') {
    await PushNotifications.createChannel({ id: 'chatx-messages', name: 'الرسائل', importance: 4, visibility: 1, vibration: true });
  }
  window.addEventListener('online', syncPushPrefs);
  await PushNotifications.register();
  } catch (error) {
    if (lease !== generation) return;
    started = false;
    token = '';
    emitTokenChange();
    window.removeEventListener('online', syncPushPrefs);
    const handles = registrationHandles.splice(0);
    await Promise.allSettled(handles.map(handle => handle.remove()));
    if (lease === generation) retryTimer = setTimeout(() => {
      if (lease === generation) void startPushRegistration(userId).catch(() => undefined);
    }, Math.min(60_000, 5000 * 2 ** Math.min(retryCount++, 4)));
    throw error;
  }
}

export function syncPushPrefs() {
  if (!started && registrationUserId) {
    const userId = registrationUserId;
    void PushNotifications.checkPermissions().then(permission => {
      if (permission.receive === 'granted' && registrationUserId === userId) return startPushRegistration(userId);
    }).catch(() => undefined);
  }
  else if (started && !candidate) void PushNotifications.register().catch(() => undefined);
  else if (!token && candidate) retrySync();
  else void syncPrefs().catch(() => { if (started && token) schedulePrefsRetry(); });
}

export async function refreshPushRegistration(userId: string) {
  await startPushRegistration(userId);
  if (started) await PushNotifications.register();
}

export function resetPushRegistrationForTests() {
  token = '';
  started = false;
  registrationUserId = '';
  candidate = '';
  generation++;
  clearTimeout(retryTimer);
  syncing = undefined;
  prefsSyncing = undefined;
  retryCount = 0;
  prefsRetry = 0;
  window.removeEventListener('online', syncPushPrefs);
  registrationHandles.splice(0);
  tokenListeners.clear();
}

export async function stopPushRegistration() {
  const current = candidate;
  const handles = registrationHandles.splice(0);
  token = '';
  started = false;
  registrationUserId = '';
  candidate = '';
  generation++;
  clearTimeout(retryTimer);
  syncing = undefined;
  prefsSyncing = undefined;
  window.removeEventListener('online', syncPushPrefs);
  emitTokenChange();
  // Capture the old session before awaiting native listener removal or a new login.
  const unregister = current ? adminFetch('/api/push/unregister', { method: 'POST', body: { token: current } }) : Promise.resolve();
  await Promise.allSettled([
    ...handles.map(handle => handle.remove()),
    PushNotifications.removeAllDeliveredNotifications(),
    unregister,
  ]);
}
