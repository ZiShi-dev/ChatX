import { afterEach, expect, it, vi } from 'vitest';
import { observeNetwork, reportNetworkFailure, reportNetworkSuccess, useNetworkStore } from './networkStore';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); reportNetworkSuccess(0); });

it('recovers while the phone still claims to be online, without reopening the app', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('navigator', { onLine: true });
  const request = vi.fn().mockRejectedValueOnce(new Error('network lost')).mockResolvedValueOnce({ ok: true });
  vi.stubGlobal('fetch', request);
  const stop = observeNetwork();
  try {
    reportNetworkFailure();
    expect(useNetworkStore.getState().network).toBe('offline');
    await vi.advanceTimersByTimeAsync(1000);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(request).toHaveBeenCalledTimes(2);
    expect(useNetworkStore.getState().network).toBe('online');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(request).toHaveBeenCalledTimes(2);
  } finally { stop(); }
});

it('uses browser connectivity, resumes online and removes its listeners', () => {
  let online = true;
  vi.stubGlobal('navigator', { get onLine() { return online; } });
  const stop = observeNetwork();
  online = false; window.dispatchEvent(new Event('offline'));
  expect(useNetworkStore.getState().network).toBe('offline');
  online = true; window.dispatchEvent(new Event('online'));
  expect(useNetworkStore.getState().network).toBe('online');
  stop(); online = false; window.dispatchEvent(new Event('offline'));
  expect(useNetworkStore.getState().network).toBe('online');
});

it('uses the available connection estimate without polling the Internet', () => {
  const connection = Object.assign(new EventTarget(), { effectiveType: '2g' });
  vi.stubGlobal('navigator', { onLine: true, connection });
  const stop = observeNetwork();
  expect(useNetworkStore.getState().network).toBe('slow');
  connection.effectiveType = '4g'; connection.dispatchEvent(new Event('change'));
  expect(useNetworkStore.getState().network).toBe('online');
  stop();
});
