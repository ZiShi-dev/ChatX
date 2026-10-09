import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startPolling } from './poll';
import { useSettingsStore } from '../stores/settingsStore';
import { useNetworkStore } from '../stores/networkStore';

describe('network polling', () => {
  let stop: (() => void) | undefined;
  beforeEach(() => {
    useNetworkStore.getState().setNetwork('online');
    vi.useFakeTimers();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  });
  it('refreshes immediately after measured recovery even without a browser online event', async () => {
    const task = vi.fn(async () => undefined);
    stop = startPolling(task);
    await vi.advanceTimersByTimeAsync(0);
    useNetworkStore.getState().setNetwork('offline');
    useNetworkStore.getState().setNetwork('online');
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(2);
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
  it('backs off repeated failed refreshes and resumes immediately on recovery', async () => {
    const task = vi.fn(async () => 'offline');
    stop = startPolling(task);
    await vi.advanceTimersByTimeAsync(39999);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(3);
  });
  it('honors the server retry deadline even when connectivity changes', async () => {
    const task = vi.fn(async () => { throw { retryAfter: 90000 }; });
    stop = startPolling(task);
    await vi.advanceTimersByTimeAsync(10000);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(79999);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
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
  it('halves secondary refreshes in economy mode while leaving message polling responsive', async () => {
    const previous = useSettingsStore.getState().dataSaver;
    useSettingsStore.setState({ dataSaver: true });
    const secondary = vi.fn(async () => undefined);
    const messages = vi.fn(async () => undefined);
    stop = startPolling(secondary, { economy: true });
    const stopMessages = startPolling(messages);
    try {
      await vi.advanceTimersByTimeAsync(40_000);
      expect(secondary).toHaveBeenCalledTimes(2);
      expect(messages).toHaveBeenCalledTimes(3);
    } finally { stopMessages(); useSettingsStore.setState({ dataSaver: previous }); }
  });
});
