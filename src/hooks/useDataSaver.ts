import { useSettingsStore } from '../stores/settingsStore';

export function useDataSaver() {
  return useSettingsStore((state) => state.dataSaver);
}
