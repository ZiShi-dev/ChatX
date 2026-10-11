import { useSyncExternalStore } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { constrainedDevice } from '../lib/deviceBudget';
const listeners = new Set<() => void>();
const update = () => listeners.forEach(listener => listener());
function subscribe(listener: () => void) {
  if (!listeners.size) document.addEventListener('visibilitychange', update);
  listeners.add(listener);
  return () => { listeners.delete(listener); if (!listeners.size) document.removeEventListener('visibilitychange', update); };
}
const snapshot = () => document.visibilityState !== 'hidden';
export function useProfileMotion() {
  const saver = useSettingsStore(state => state.dataSaver);
  const visible = useSyncExternalStore(subscribe, snapshot, () => false);
  return visible && !saver && !constrainedDevice();
}
