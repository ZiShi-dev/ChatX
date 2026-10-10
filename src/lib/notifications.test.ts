import { afterEach, expect, it, vi } from 'vitest';
import { notifyChatMessage, readChatNotificationPermission } from './notifications';
import { useSettingsStore } from '../stores/settingsStore';
import { DEFAULT_NOTIFY_TYPES } from './inbox';
const input = { conversationId: 'room', kind: 'private' as const, title: 'Sender', body: 'Hello', mention: 'message' as const };
afterEach(() => { vi.unstubAllGlobals(); useSettingsStore.setState({ notifyTypes: { ...DEFAULT_NOTIFY_TYPES } }); delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker; });
it('uses persistent service worker notifications on mobile browsers', async () => {
  const constructor = vi.fn(); Object.assign(constructor, { permission: 'granted' }); vi.stubGlobal('Notification', constructor); await readChatNotificationPermission();
  const showNotification = vi.fn(async () => undefined);
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => ({ active: {}, showNotification }) } });
  await notifyChatMessage(input);
  expect(showNotification).toHaveBeenCalledWith('Sender', expect.objectContaining({ body: 'Hello', data: { conversationId: 'room' } })); expect(constructor).not.toHaveBeenCalled();
});
it('does not display disabled notification types', async () => {
  const constructor = vi.fn(); Object.assign(constructor, { permission: 'granted' }); vi.stubGlobal('Notification', constructor); await readChatNotificationPermission();
  useSettingsStore.setState({ notifyTypes: { ...DEFAULT_NOTIFY_TYPES, message: false } });
  await notifyChatMessage(input); expect(constructor).not.toHaveBeenCalled();
});
