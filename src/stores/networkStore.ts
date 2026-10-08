import { create } from 'zustand';
import type { NetworkState } from '../types/settings';

type NetworkStore = {
  network: NetworkState;
  setNetwork: (network: NetworkState) => void;
};

export const useNetworkStore = create<NetworkStore>((set) => ({
  network: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online',
  setNetwork: (network) => set((state) => (state.network === network ? state : { network })),
}));

type Connection = EventTarget & { effectiveType?: string; saveData?: boolean };

export function observeNetwork() {
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  const sync = () => {
    const slow = connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g';
    useNetworkStore.getState().setNetwork(navigator.onLine === false ? 'offline' : slow ? 'slow' : 'online');
  };
  sync();
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  connection?.addEventListener('change', sync);
  return () => {
    window.removeEventListener('online', sync);
    window.removeEventListener('offline', sync);
    connection?.removeEventListener('change', sync);
  };
}
