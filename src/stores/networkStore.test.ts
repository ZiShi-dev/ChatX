import { afterEach, expect, it, vi } from 'vitest';
import { resetNetworkMeasurements, observeNetwork, reportNetworkFailure, reportNetworkSuccess, useNetworkStore } from './networkStore';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); resetNetworkMeasurements(); reportNetworkSuccess(0); });

it('recovers while the phone still claims to be online, without reopening the app', async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
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

it('forgets a weak or lost connection caused by leaving the app', () => {
  vi.useFakeTimers();
  vi.stubGlobal('navigator', { onLine: true });
  const stop = observeNetwork();
  const visibility = vi.spyOn(document, 'visibilityState', 'get');
  try {
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    reportNetworkFailure(true);
    expect(useNetworkStore.getState().network).toBe('online');
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    reportNetworkFailure();
    expect(useNetworkStore.getState().network).toBe('online');
    vi.advanceTimersByTime(8000);
    reportNetworkFailure();
    expect(useNetworkStore.getState().network).toBe('offline');
  } finally { stop(); }
});

it('keeps degraded quality until useful responses prove sustained recovery', () => {
  vi.useFakeTimers(); vi.stubGlobal('navigator', { onLine: true });
  for(let i=0;i<3;i++) reportNetworkSuccess(3500);
  expect(useNetworkStore.getState().network).toBe('slow');
  reportNetworkSuccess(1,false); expect(useNetworkStore.getState().network).toBe('slow');
  reportNetworkSuccess(500); reportNetworkSuccess(500); vi.advanceTimersByTime(10000); reportNetworkSuccess(500);
  expect(useNetworkStore.getState().network).toBe('online');
});
