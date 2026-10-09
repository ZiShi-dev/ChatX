import { PRESENCE_BEAT_MS } from '../constants/chat';
import { useSettingsStore } from '../stores/settingsStore';
import { useNetworkStore } from '../stores/networkStore';

/** Schedule after completion so a slow connection never stacks requests. */
export function startPolling(task: () => Promise<unknown>, options: { active?: () => boolean; background?: boolean; immediate?: boolean; economy?: boolean } = {}) {
  let stopped = false;
  let running = false;
  let timer: number | undefined;
  const delay = () => document.visibilityState === 'hidden' ? 60_000
    : options.economy && (useSettingsStore.getState().dataSaver || useNetworkStore.getState().network === 'slow') ? 40_000 : PRESENCE_BEAT_MS;
  const tick = async () => {
    if (stopped || running) return;
    window.clearTimeout(timer);
    running = true;
    try {
      if (navigator.onLine !== false && (options.background || document.visibilityState !== 'hidden') && (options.active?.() ?? true)) {
        await task();
      }
    } catch {
      // The caller owns error UI; the next scheduled refresh can recover.
    } finally {
      running = false;
      if (!stopped) timer = window.setTimeout(() => void tick(), delay());
    }
  };
  const wake = () => { void tick(); };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('online', wake);
  if (options.immediate !== false) void tick();
  else timer = window.setTimeout(wake, delay());
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('online', wake);
  };
}
