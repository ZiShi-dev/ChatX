import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Avatar from './Avatar';
import { useSettingsStore } from '../../stores/settingsStore';

const saver = useSettingsStore.getState().dataSaver;
afterEach(() => { cleanup(); useSettingsStore.setState({ dataSaver: saver }); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('preserves the plain avatar and shows an optional removable hat without fetching media', () => {
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);
  useSettingsStore.setState({ dataSaver: false });
  const { container, rerender } = render(<Avatar name="User" color="#3d9b84" decoration="hat" animate />);
  expect(container.querySelector('.decoration-hat')).not.toBeNull();
  // No visibility observer means a static fallback, rather than unbounded animations.
  expect(container.querySelector('.decoration-hat.is-animated')).toBeNull();
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
