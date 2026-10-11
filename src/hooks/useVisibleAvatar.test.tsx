import { act, cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useVisibleAvatar } from './useVisibleAvatar';
import { useSettingsStore } from '../stores/settingsStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function Sample() {
  const ref = useRef<HTMLSpanElement>(null);
  const moving = useVisibleAvatar(ref, true);
  return <span ref={ref} data-moving={moving} />;
}
it.each([[4, 2], [8, 6]])('caps visible animation on %s cores at %s avatars', (cores, limit) => {
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(cores);
  useSettingsStore.setState({ dataSaver: false });
  let callback: IntersectionObserverCallback;
  vi.stubGlobal('IntersectionObserver', class {
    constructor(fn: IntersectionObserverCallback) { callback = fn; }
    observe() {} unobserve() {} disconnect() {}
  });
  const { container } = render(<>{Array.from({ length: 8 }, (_, i) => <Sample key={i} />)}</>);
  const elements = [...container.querySelectorAll('span')];
  act(() => callback(elements.map(target => ({ target, isIntersecting: true })) as unknown as IntersectionObserverEntry[], {} as IntersectionObserver));
  expect(container.querySelectorAll('[data-moving="true"]')).toHaveLength(limit);
  act(() => callback([{ target: elements[0], isIntersecting: false }] as unknown as IntersectionObserverEntry[], {} as IntersectionObserver));
  expect(elements[0].dataset.moving).toBe('false');
  expect(container.querySelectorAll('[data-moving="true"]')).toHaveLength(limit);
});
