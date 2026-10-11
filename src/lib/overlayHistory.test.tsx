import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useOverlayHistory } from './overlayBack';
const initial = window.history.state;
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(initial, ''); });
it('preserves the route index and source page when opening a temporary overlay', () => {
  const origin = { idx: 4, key: 'route', usr: { notificationReturn: { path: '/notifications', index: 3 } } };
  window.history.replaceState(origin, '');
  const push = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
  renderHook(() => useOverlayHistory(true, vi.fn()));
  expect(push).toHaveBeenCalledWith(expect.objectContaining(origin), '');
});
it('assigns distinct keys to overlays opened in the same millisecond', () => {
  vi.spyOn(Date, 'now').mockReturnValue(100);
  const push = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
  renderHook(() => useOverlayHistory(true, vi.fn()));
  renderHook(() => useOverlayHistory(true, vi.fn()));
  expect(push.mock.calls[0][0].chatxOverlay).not.toBe(push.mock.calls[1][0].chatxOverlay);
});
