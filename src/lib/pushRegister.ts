import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { adminFetch } from './adminApi';
import { isServerId } from './home';
import { quietLevel, useMuteStore } from '../stores/muteStore';
import { useSettingsStore } from '../stores/settingsStore';

let token = '';
let started = false;

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
  token = value;
  await adminFetch('/api/push/register', { method: 'POST', body: JSON.stringify({ token: value, platform: Capacitor.getPlatform() }) });
  await syncPrefs();
}

export async function startPushRegistration(userId: string) {
  if (!Capacitor.isNativePlatform() || !isServerId(userId) || started) return;
  started = true;
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') {
    started = false;
    return;
  }
  await PushNotifications.addListener('registration', (event) => {
    void syncToken(event.value).catch(() => undefined);
  });
  await PushNotifications.addListener('registrationError', () => {
    started = false;
  });
  await PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    const conversationId = event.notification.data?.conversationId;
    if (typeof conversationId === 'string' && conversationId) {
      window.location.assign(`/chat/${conversationId}`);
    }
  });
  await PushNotifications.register();
}

export function syncPushPrefs() {
  void syncPrefs().catch(() => undefined);
}

export async function stopPushRegistration() {
  if (!token) return;
  const current = token;
  token = '';
  started = false;
  await adminFetch('/api/push/unregister', { method: 'POST', body: JSON.stringify({ token: current }) }).catch(() => undefined);
  await PushNotifications.removeAllListeners();
}
