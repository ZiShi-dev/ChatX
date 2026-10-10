import { afterEach, expect, it, vi } from 'vitest';
import { createNotificationCadence } from './notificationCadence';
import { useSettingsStore } from '../stores/settingsStore';
import { useNetworkStore } from '../stores/networkStore';
const originalSaver = useSettingsStore.getState().dataSaver;
afterEach(() => { useSettingsStore.setState({ dataSaver: originalSaver }); useNetworkStore.getState().setNetwork('online'); vi.restoreAllMocks(); delete (navigator as unknown as { connection?: unknown }).connection; });
it('reduces quiet weak-network checks and restores the responsive interval on a new message', () => {
  useNetworkStore.getState().setNetwork('slow'); useSettingsStore.setState({ dataSaver: false });
  const cadence = createNotificationCadence(); cadence.observe([], 0);
  expect(cadence.delay()).toBe(15000); expect(cadence.delay(true)).toBe(30000);
  for (let i = 0; i < 4; i++) cadence.observe([], 0);
  expect(cadence.delay()).toBe(30000); expect(cadence.delay(true)).toBe(60000);
  cadence.observe([{ id: 'new', kind: 'message', createdAt: 'now', unread: true }], 1);
  expect(cadence.delay()).toBe(15000);
});
it('considers a weak connection even on a powerful phone and respects data saver', () => {
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);
  useNetworkStore.getState().setNetwork('online'); useSettingsStore.setState({ dataSaver: false });
  Object.defineProperty(navigator, 'connection', { configurable: true, value: { effectiveType: '3g', downlink: 0.5 } });
  expect(createNotificationCadence().delay()).toBe(15000);
  delete (navigator as unknown as { connection?: unknown }).connection;
  useSettingsStore.setState({ dataSaver: true }); expect(createNotificationCadence().delay()).toBe(15000);
});
