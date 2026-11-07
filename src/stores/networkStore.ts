import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import { apiFetchOrigin } from '../lib/apiFetchOrigin';
import { nativeNeedsApiOrigin } from '../lib/apiOrigin';
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
let serverConfirmedDown = false;
let checkRecovery: (() => void) | undefined;
let slowResponses = 0;
let fastResponses = 0;
let recoveryStarted = 0;
let degraded = false;
let leftApp = false;
let resumeGraceUntil = 0;

export function resetNetworkMeasurements() {
  slowResponses = fastResponses = recoveryStarted = 0;
  degraded = transportFailed = serverConfirmedDown = leftApp = false;
  resumeGraceUntil = 0;
}

/** The phone itself reports no link, or a health check confirmed the server is unreachable. */
export function connectionLost() {
  return (typeof navigator !== 'undefined' && navigator.onLine === false) || useNetworkStore.getState().network === 'offline';
}

export function reportNetworkFailure(stalled = false) {
  if (nativeNeedsApiOrigin()) return;
  if (typeof document !== 'undefined' && (document.visibilityState === 'hidden' || Date.now() < resumeGraceUntil)) return;
  if (navigator.onLine === false) {
    transportFailed = true;
    serverConfirmedDown = true;
    fastResponses = 0;
    useNetworkStore.getState().setNetwork('offline');
    checkRecovery?.();
    return;
  }
  // One slow or dropped request is a weak link. The red banner waits for a failed health check.
  if (stalled) {
    degraded = true;
    useNetworkStore.getState().setNetwork('slow');
    return;
  }
  transportFailed = true;
  degraded = true;
  fastResponses = 0;
  useNetworkStore.getState().setNetwork(serverConfirmedDown ? 'offline' : 'slow');
  checkRecovery?.();
}

function confirmServerDown() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    serverConfirmedDown = true;
    useNetworkStore.getState().setNetwork('offline');
    return;
  }
  if (!transportFailed) return;
  serverConfirmedDown = true;
  useNetworkStore.getState().setNetwork('offline');
}

export function reportNetworkSuccess(elapsed: number, useful = true) {
  transportFailed = false;
  serverConfirmedDown = false;
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
    const timeout = window.setTimeout(() => request.abort(), 15_000);
    const started = Date.now();
    try {
      const url = Capacitor.isNativePlatform()
        ? (() => { const origin = apiFetchOrigin(); return origin ? `${origin}/api/health` : ''; })()
        : '/api/health';
      if (!url) return;
      const response = await fetch(url, { cache: 'no-store', signal: request.signal });
      if (response.ok && !stopped && !request.signal.aborted) {
        attempts = 0;
        reportNetworkSuccess(Date.now() - started, false);
      } else if (!stopped && !request.signal.aborted) confirmServerDown();
    } catch {
      if (!stopped) confirmServerDown();
    }
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
    if (document.visibilityState === 'hidden') return;
    const slow = degraded || transportFailed || connection?.saveData || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g';
    const unreachable = navigator.onLine === false || (transportFailed && serverConfirmedDown);
    useNetworkStore.getState().setNetwork(unreachable ? 'offline' : slow ? 'slow' : 'online');
    if (navigator.onLine !== false && transportFailed) { window.clearTimeout(timer); timer = undefined; void probe(); }
  };
  sync();
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      leftApp = true;
      return;
    }
    if (!leftApp) return;
    leftApp = false;
    transportFailed = false;
    serverConfirmedDown = false;
    degraded = false;
    slowResponses = 0;
    fastResponses = 0;
    recoveryStarted = 0;
    resumeGraceUntil = Date.now() + 8000;
    sync();
  };
  connection?.addEventListener('change', sync);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    stopped = true;
    checkRecovery = undefined;
    window.clearTimeout(timer);
    controller?.abort();
    window.removeEventListener('online', sync);
    window.removeEventListener('offline', sync);
    connection?.removeEventListener('change', sync);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
