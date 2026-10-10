import { constrainedDevice } from './deviceBudget';
import { useSettingsStore } from '../stores/settingsStore';
import { useNetworkStore } from '../stores/networkStore';

type NoticeVersion = { id: string; kind: string; createdAt: string; unread: boolean };
export function createNotificationCadence() {
  let signature: string | undefined;
  let unchanged = 0;
  return {
    observe(items: NoticeVersion[], unread: number) {
      const next = JSON.stringify([unread, items.slice(0, 100).map(item => [item.id, item.kind, item.createdAt, item.unread])]);
      unchanged = next === signature ? Math.min(unchanged + 1, 4) : 0;
      signature = next;
    },
    delay(hidden = false) {
      const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string; downlink?: number; rtt?: number } }).connection;
      const limited = constrainedDevice() || useSettingsStore.getState().dataSaver || useNetworkStore.getState().network === 'slow'
        || connection?.saveData || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType ?? '')
        || (typeof connection?.downlink === 'number' && connection.downlink > 0 && connection.downlink < 0.75)
        || (typeof connection?.rtt === 'number' && connection.rtt >= 600);
      if (!limited) return hidden ? 30_000 : 10_000;
      return hidden ? unchanged >= 4 ? 90_000 : 45_000 : unchanged >= 4 ? 45_000 : 20_000;
    },
  };
}
