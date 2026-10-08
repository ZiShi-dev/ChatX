import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startPolling } from './poll';

describe('network polling', () => {
  let stop: (() => void) | undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  });
  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it('never overlaps slow requests and removes timers on stop', async () => {
    let finish: (() => void) | undefined;
    const task = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    stop = startPolling(task);
    await vi.advanceTimersByTimeAsync(60_000);
    window.dispatchEvent(new Event('online'));
    expect(task).toHaveBeenCalledTimes(1);
    finish?.();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(task).toHaveBeenCalledTimes(2);
    stop();
    finish?.();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(task).toHaveBeenCalledTimes(2);
  });
  it('skips hidden, offline and inactive screens, then resumes on reconnect', async () => {
    const task = vi.fn(async () => undefined);
    let active = false;
    stop = startPolling(task, { active: () => active });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(task).not.toHaveBeenCalled();
    active = true;
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(task).not.toHaveBeenCalled();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(task).not.toHaveBeenCalled();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
  });
  it('keeps web background notifications at a slower interval', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const task = vi.fn(async () => undefined);
    stop = startPolling(task, { background: true });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(2);
  });
});
