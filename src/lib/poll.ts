import { PRESENCE_BEAT_MS } from '../constants/chat';

/** Schedule after completion so a slow connection never stacks requests. */
export function startPolling(task: () => Promise<unknown>, options: { active?: () => boolean; background?: boolean; immediate?: boolean } = {}) {
  let stopped = false;
  let running = false;
  let timer: number | undefined;
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
      if (!stopped) timer = window.setTimeout(() => void tick(), document.visibilityState === 'hidden' ? 60_000 : PRESENCE_BEAT_MS);
    }
  };
  const wake = () => { void tick(); };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('online', wake);
  if (options.immediate !== false) void tick();
  else timer = window.setTimeout(wake, PRESENCE_BEAT_MS);
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('online', wake);
  };
}
