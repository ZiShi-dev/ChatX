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

it('reserves a square decoration slot and keeps tiny avatars unobstructed', () => {
  const { container, rerender } = render(<Avatar name="User" color="#3d9b84" size={36} decoration="dragon" />);
  const frame = container.querySelector<HTMLElement>('.avatar-frame')!;
  expect(frame.style.width).toBe('36px');
  expect(frame.style.height).toBe('36px');
  expect(frame.style.minWidth).toBe('36px');
  expect(container.querySelector('.dragon-artwork')).not.toBeNull();
  expect(container.querySelector('.is-animated')).toBeNull();
  rerender(<Avatar name="User" color="#3d9b84" size={18} decoration="dragon" />);
  expect(container.querySelector('.avatar-frame')).toBeNull();
  expect(container.querySelector<HTMLElement>('.avatar')!.style.width).toBe('18px');
});

it('confines cultivation artwork to the banner and keeps it static with data saving', () => {
  useSettingsStore.setState({ dataSaver: true });
  const { container, rerender } = render(<ProfileEffect effect="celestial-dragon" color="#3d9b84" placement="banner" />);
  expect(container.querySelector('.is-banner .scene-celestial-dragon')).not.toBeNull();
  expect(container.querySelector('.is-animated')).toBeNull();
  rerender(<ProfileEffect effect="celestial-dragon" color="#3d9b84" />);
  expect(container.querySelector('.cultivation-scene')).toBeNull();
  rerender(<ProfileEffect effect="sword-domain" color="#3d9b84" placement="banner" />);
  expect(container.querySelectorAll('.immortal-sword')).toHaveLength(6);
  expect(container.querySelector('.cultivation-scene img')).toBeNull();
  expect(container.querySelectorAll('.smoke-ribbon')).toHaveLength(3);
  expect(container.querySelector('.cultivation-aura')).not.toBeNull();
  expect(container.querySelector('rect')).toBeNull();
  rerender(<ProfileEffect effect="time-cicada" color="#3d9b84" placement="banner" />);
  expect(container.querySelector('.gu-cicada')).not.toBeNull();
});
