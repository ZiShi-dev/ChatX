import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Avatar from './Avatar';
import ProfileEffect from './ProfileEffect';
import { useSettingsStore } from '../../stores/settingsStore';

const saver = useSettingsStore.getState().dataSaver;
afterEach(() => { cleanup(); useSettingsStore.setState({ dataSaver: saver }); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('preserves the plain avatar and shows an optional removable hat without fetching media', () => {
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);
  useSettingsStore.setState({ dataSaver: false });
  const { container, rerender } = render(<Avatar name="User" color="#3d9b84" decoration="hat" animate />);
  expect(container.querySelector('.decoration-hat.is-animated')).not.toBeNull();
  expect(container.querySelector('img')).toBeNull();
  rerender(<Avatar name="User" color="#3d9b84" decoration="none" />);
  expect(container.querySelector('.avatar-frame')).toBeNull();
  expect(container.querySelector('.avatar')).not.toBeNull();
});

it('shares one observer and only animates visible avatars outside economy mode', () => {
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);
  useSettingsStore.setState({ dataSaver: false });
  let callback: IntersectionObserverCallback;
  let created = 0;
  const disconnect = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(fn: IntersectionObserverCallback) { callback = fn; created++; }
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = disconnect;
  });
  const { container } = render(<><Avatar name="A" color="#3d9b84" decoration="hat" /><Avatar name="B" color="#3d9b84" decoration="hat-rain" /></>);
  const frames = [...container.querySelectorAll('.avatar-frame')];
  expect(created).toBe(1);
  expect(container.querySelector('.is-animated')).toBeNull();
  act(() => callback([{ target: frames[0], isIntersecting: true }, { target: frames[1], isIntersecting: false }] as IntersectionObserverEntry[], {} as IntersectionObserver));
  expect(frames[0].classList.contains('is-animated')).toBe(true);
  expect(frames[1].classList.contains('is-animated')).toBe(false);
  act(() => callback([{ target: frames[0], isIntersecting: false }] as IntersectionObserverEntry[], {} as IntersectionObserver));
  expect(container.querySelector('.is-animated')).toBeNull();
  act(() => useSettingsStore.setState({ dataSaver: true }));
  expect(disconnect).toHaveBeenCalledOnce();
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
  expect(container.querySelector('.jade-dragon-front')).not.toBeNull();
  expect(container.querySelector('.is-animated')).toBeNull();
  rerender(<Avatar name="User" color="#3d9b84" size={18} decoration="dragon" />);
  expect(container.querySelector('.avatar-frame')).toBeNull();
  expect(container.querySelector<HTMLElement>('.avatar')!.style.width).toBe('18px');
});

it('displays cultivation artwork across the profile and keeps it static with data saving', () => {
  useSettingsStore.setState({ dataSaver: true });
  const { container, rerender } = render(<ProfileEffect effect="celestial-dragon" color="#3d9b84" />);
  expect(container.querySelector('.profile-effect .scene-celestial-dragon')).not.toBeNull();
  expect(container.querySelector('.is-animated')).toBeNull();
  rerender(<ProfileEffect effect="celestial-dragon" color="#3d9b84" />);
  expect(container.querySelector('.cultivation-scene')).not.toBeNull();
  rerender(<ProfileEffect effect="sword-domain" color="#3d9b84" />);
  expect(container.querySelectorAll('.immortal-sword')).toHaveLength(6);
  expect(container.querySelector('.cultivation-scene img')).toBeNull();
  expect(container.querySelectorAll('.smoke-ribbon')).toHaveLength(3);
  expect(container.querySelector('.cultivation-aura')).not.toBeNull();
  expect(container.querySelector('rect')).toBeNull();
  rerender(<ProfileEffect effect="time-cicada" color="#3d9b84" />);
  expect(container.querySelector('.gu-cicada')).not.toBeNull();
  rerender(<ProfileEffect effect="jade-petals" color="#3d9b84" />);
  expect(container.querySelectorAll('.drift-petal')).toHaveLength(8);
  rerender(<ProfileEffect effect="spirit-embers" color="#3d9b84" />);
  expect(container.querySelectorAll('.ember')).toHaveLength(8);
  expect(container.querySelector('image, img, animate, filter')).toBeNull();
});

it.each(['jade-lotus', 'heavenly-tribulation', 'jade-petals', 'spirit-embers'] as const)('keeps %s optional, local and static in economy mode', effect => {
  useSettingsStore.setState({ dataSaver: true });
  const { container, rerender } = render(<ProfileEffect effect={effect} color="#3d9b84" />);
  expect(container.querySelector('.scene-' + effect)).not.toBeNull();
  expect(container.querySelector('.is-animated')).toBeNull();
  expect(container.querySelector('image, img, animate, filter')).toBeNull();
  rerender(<ProfileEffect effect={effect} color="#3d9b84" />);
  expect(container.querySelector('.cultivation-scene')).not.toBeNull();
  rerender(<ProfileEffect effect="none" color="#3d9b84" />);
  expect(container.querySelector('.profile-effect')).toBeNull();
});

it('layers both reference hats around the face without external assets and keeps receipt avatars plain', () => {
  const { container, rerender } = render(<Avatar name="User" color="#3d9b84" decoration="hat-rain" size={80} animate />);
  const frame = container.querySelector('.avatar-frame')!;
  expect(frame.children[0].classList.contains('hat-back-artwork')).toBe(true);
  expect(frame.children[1].classList.contains('avatar')).toBe(true);
  expect(frame.children[2].classList.contains('hat-artwork')).toBe(true);
  expect(container.querySelector('.hat-cords')).not.toBeNull();
  expect(container.querySelector('.hat-rain-back')).not.toBeNull();
  expect(container.querySelector('.hat-rain-front')).not.toBeNull();
  expect(container.querySelector('image, animate, filter')).toBeNull();
  rerender(<Avatar name="User" color="#3d9b84" decoration="hat" size={80} />);
  expect(container.querySelector('.hat-cords')).not.toBeNull();
  expect(container.querySelector('.hat-rain-front')).toBeNull();
  rerender(<Avatar name="User" color="#3d9b84" decoration="hat-rain" size={18} />);
  expect(container.querySelector('.avatar-frame')).toBeNull();
});
