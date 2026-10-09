import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
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

let transportFailed = false;
let checkRecovery: (() => void) | undefined;

export function reportNetworkFailure(stalled = false) {
  transportFailed = true;
  useNetworkStore.getState().setNetwork(stalled && navigator.onLine !== false ? 'slow' : 'offline');
  checkRecovery?.();
}

export function reportNetworkSuccess(elapsed: number) {
  transportFailed = false;
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  useNetworkStore.getState().setNetwork(navigator.onLine === false ? 'offline'
    : elapsed >= 5000 || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '') ? 'slow' : 'online');
}

export function observeNetwork() {
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  let stopped = false;
  let timer: number | undefined;
  let controller: AbortController | undefined;
  let attempts = 0;
  const probe = async () => {
    if (stopped || controller || !transportFailed || navigator.onLine === false || document.visibilityState === 'hidden') return;
    window.clearTimeout(timer);
    timer = undefined;
    const request = new AbortController();
    controller = request;
    const timeout = window.setTimeout(() => request.abort(), 5000);
    const started = Date.now();
    try {
      const origin = Capacitor.isNativePlatform() ? (import.meta.env.VITE_API_ORIGIN ?? '').trim().replace(/\/$/, '') : '';
      const response = await fetch(`${origin}/api/health`, { cache: 'no-store', signal: request.signal });
      if (response.ok && !stopped && !request.signal.aborted) {
        attempts = 0;
        reportNetworkSuccess(Date.now() - started);
      }
    } catch { /* Keep recovery checks small and bounded while disconnected. */ }
    finally {
      window.clearTimeout(timeout);
      controller = undefined;
      if (!stopped && transportFailed) timer = window.setTimeout(() => void probe(), Math.min(30_000, 5000 * 2 ** Math.min(attempts++, 3)));
    }
  };
  checkRecovery = () => {
    if (timer === undefined && !controller) timer = window.setTimeout(() => { timer = undefined; void probe(); }, 1000);
  };
  const sync = () => {
    const slow = connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g';
    useNetworkStore.getState().setNetwork(navigator.onLine === false ? 'offline' : transportFailed || slow ? 'slow' : 'online');
    if (navigator.onLine !== false && transportFailed) { window.clearTimeout(timer); timer = undefined; void probe(); }
  };
  sync();
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  connection?.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  return () => {
    stopped = true;
    checkRecovery = undefined;
    window.clearTimeout(timer);
    controller?.abort();
    window.removeEventListener('online', sync);
    window.removeEventListener('offline', sync);
    connection?.removeEventListener('change', sync);
    document.removeEventListener('visibilitychange', sync);
  };
}
