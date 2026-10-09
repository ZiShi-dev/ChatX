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
let slowResponses = 0;
let fastResponses = 0;
let recoveryStarted = 0;
let degraded = false;

export function resetNetworkMeasurements() {
  slowResponses = fastResponses = recoveryStarted = 0;
  degraded = transportFailed = false;
}

export function reportNetworkFailure(stalled = false) {
  transportFailed = true;
  fastResponses = 0;
  if (stalled) degraded = true;
  useNetworkStore.getState().setNetwork(stalled && navigator.onLine !== false ? 'slow' : 'offline');
  checkRecovery?.();
}

export function reportNetworkSuccess(elapsed: number, useful = true) {
  transportFailed = false;
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  if (useful) {
    if (elapsed > 3000) { slowResponses++; fastResponses = 0; if (slowResponses >= 3) degraded = true; }
    else { slowResponses = 0; if (elapsed < 1500) { if (!fastResponses) recoveryStarted = Date.now(); fastResponses++; }
      else fastResponses = 0; }
    if (fastResponses >= 3 && Date.now() - recoveryStarted >= 10_000) degraded = false;
  }
  useNetworkStore.getState().setNetwork(navigator.onLine === false ? 'offline'
    : degraded || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '') || connection?.saveData ? 'slow' : 'online');
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
        reportNetworkSuccess(Date.now() - started, false);
      }
    } catch { /* Keep recovery checks small and bounded while disconnected. */ }
    finally {
      window.clearTimeout(timeout);
      controller = undefined;
      if (!stopped && transportFailed) {
        const delay = [5000, 10_000, 20_000, 60_000][Math.min(attempts++, 3)]!;
        timer = window.setTimeout(() => void probe(), Math.round(delay * (0.8 + Math.random() * 0.4)));
      }
    }
  };
  checkRecovery = () => {
    if (timer === undefined && !controller) timer = window.setTimeout(() => { timer = undefined; void probe(); }, 1000);
  };
  const sync = () => {
    const slow = degraded || connection?.saveData || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g';
    useNetworkStore.getState().setNetwork(navigator.onLine === false ? 'offline' : transportFailed ? 'offline' : slow ? 'slow' : 'online');
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
