import { PRESENCE_BEAT_MS } from '../constants/chat';
import { useSettingsStore } from '../stores/settingsStore';
import { useNetworkStore } from '../stores/networkStore';
import { constrainedDevice } from './deviceBudget';

/** Schedule after completion so a slow connection never stacks requests. */
export function startPolling(task: () => Promise<unknown>, options: { active?: () => boolean; background?: boolean; immediate?: boolean; economy?: boolean } = {}) {
  let stopped = false;
  let running = false;
  let recoveredWhileRunning = false;
  let timer: number | undefined;
  let failures = 0;
  let retryAfter = 0;
  const delay = () => {
    const base = document.visibilityState === 'hidden' ? 60_000
      : options.economy && constrainedDevice() ? 60_000
      : options.economy && (useSettingsStore.getState().dataSaver || useNetworkStore.getState().network === 'slow') ? 40_000 : PRESENCE_BEAT_MS;
    return Math.max(retryAfter - Date.now(), failures ? Math.min(120000, base * 2 ** Math.min(failures, 3)) : base);
  };
  const tick = async () => {
    if (stopped || running) return;
    window.clearTimeout(timer);
    running = true;
    try {
      if (navigator.onLine !== false && useNetworkStore.getState().network !== 'offline' && (options.background || document.visibilityState !== 'hidden') && (options.active?.() ?? true)) {
        const result = await task();
        failures = result === 'offline' || result === 'invalid' || result === false ? failures + 1 : 0;
        retryAfter = 0;
      }
    } catch (error) {
      failures++;
      const wait = (error as { retryAfter?: unknown } | null)?.retryAfter;
      retryAfter = typeof wait === 'number' && Number.isFinite(wait) ? Date.now() + Math.max(0, wait) : 0;
      // The caller owns error UI; the next scheduled refresh can recover.
    } finally {
      running = false;
      if (!stopped) {
        timer = window.setTimeout(() => void tick(), recoveredWhileRunning ? Math.max(0, retryAfter - Date.now()) : delay());
        recoveredWhileRunning = false;
      }
    }
  };
  const wake = () => {
    failures = 0;
    if (retryAfter > Date.now()) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void tick(), retryAfter - Date.now());
    } else void tick();
  };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('online', wake);
  const unsubscribe = useNetworkStore.subscribe((state, previous) => {
    if ((state.network === 'online' && previous.network !== 'online') || (previous.network === 'offline' && state.network === 'slow')) {
      if (running) recoveredWhileRunning = true;
      else wake();
    }
  });
  if (options.immediate !== false) void tick();
  else timer = window.setTimeout(wake, delay());
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('online', wake);
    unsubscribe();
  };
}
