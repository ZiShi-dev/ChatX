import { afterEach, expect, it, vi } from 'vitest';
import { observeNetwork, useNetworkStore } from './networkStore';

afterEach(() => { vi.unstubAllGlobals(); useNetworkStore.getState().setNetwork('online'); });

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
