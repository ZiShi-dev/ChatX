import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Avatar from './Avatar';
import ProfileEffect from './ProfileEffect';
import { useSettingsStore } from '../../stores/settingsStore';

const saver = useSettingsStore.getState().dataSaver;
afterEach(() => { cleanup(); useSettingsStore.setState({ dataSaver: saver }); vi.restoreAllMocks(); });
it('preserves the plain avatar and shows an optional removable hat without fetching media', () => {
  const { container, rerender } = render(<Avatar name="User" color="#3d9b84" decoration="hat" animate />);
  expect(container.querySelector('.decoration-hat.is-animated')).not.toBeNull();
  expect(container.querySelector('img')).toBeNull();
  rerender(<Avatar name="User" color="#3d9b84" decoration="none" />);
  expect(container.querySelector('.avatar-frame')).toBeNull();
  expect(container.querySelector('.avatar')).not.toBeNull();
});
it('keeps profile effects static in economy mode and on constrained phones', () => {
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);
  useSettingsStore.setState({ dataSaver: true });
  const { container, rerender } = render(<ProfileEffect effect="stars" color="#3d9b84" />);
  expect(container.querySelector('.is-animated')).toBeNull();
  act(() => useSettingsStore.setState({ dataSaver: false }));
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(2);
  rerender(<ProfileEffect effect="aurora" color="#3d9b84" />);
  expect(container.querySelector('.is-animated')).toBeNull();
  rerender(<ProfileEffect effect="none" color="#3d9b84" />);
  expect(container.querySelector('.profile-effect')).toBeNull();
});
it('pauses animations when the page is hidden and removes its listener on unmount', () => {
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);
  useSettingsStore.setState({ dataSaver: false });
  let visibility: DocumentVisibilityState = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  const remove = vi.spyOn(document, 'removeEventListener');
  const { container, unmount } = render(<ProfileEffect effect="stars" color="#3d9b84" />);
  expect(container.querySelector('.is-animated')).not.toBeNull();
  visibility = 'hidden';
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(container.querySelector('.is-animated')).toBeNull();
  unmount();
  expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
});
