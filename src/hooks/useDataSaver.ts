import { useNetworkStore } from '../stores/networkStore';
import { useSettingsStore } from '../stores/settingsStore';

export function useDataSaver() {
  const chosen = useSettingsStore((state) => state.dataSaver);
  const network = useNetworkStore((state) => state.network);
  return chosen || network !== 'online';
}
