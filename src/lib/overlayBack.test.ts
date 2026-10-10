import { afterEach, expect, it, vi } from 'vitest';
import { closeTopOverlay, registerOverlayClose } from './overlayBack';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

it('closes the top custom overlay before navigation', () => {
  const close = vi.fn();
  const stop = registerOverlayClose(close);
  expect(closeTopOverlay()).toBe(true);
  expect(close).toHaveBeenCalledTimes(1);
  stop();
});

it('clicks scrim overlays before leaving the page', () => {
  const click = vi.fn();
  const scrim = document.createElement('div');
  scrim.className = 'app-scrim sheet';
  scrim.addEventListener('click', click);
  document.body.append(scrim);
  expect(closeTopOverlay()).toBe(true);
  expect(click).toHaveBeenCalledTimes(1);
});
