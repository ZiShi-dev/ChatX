import { afterEach, expect, it, vi } from 'vitest';
import { observeComposerViewport } from './composerViewport';
afterEach(() => vi.unstubAllGlobals());
function setup(follow: boolean) {
  let resize!: () => void;
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() {} });
  const node = document.createElement('div'); let height = 600;
  Object.defineProperty(node, 'clientHeight', { get: () => height }); Object.defineProperty(node, 'scrollHeight', { value: 1600 });
  node.scrollTop = follow ? 1000 : 300;
  const following = { current: follow }; const stop = observeComposerViewport(node, following);
  return {
    node,
    following,
    stop,
    resize: (next: number) => { height = next; resize(); },
    earlyScroll: (next: number, top?: number) => {
      height = next;
      if (top !== undefined) node.scrollTop = top;
      node.dispatchEvent(new Event('scroll'));
    },
  };
}
it('sticks to the bottom when the composer shrinks and the user was following', () => {
  const test = setup(true);
  test.resize(578);
  expect(test.node.scrollTop).toBe(1022);
  test.resize(524);
  expect(test.node.scrollTop).toBe(1076);
  test.resize(600);
  expect(test.node.scrollTop).toBe(1000);
  test.stop();
});
it('undoes a scroll emitted by the composer resize', () => {
  const test = setup(true); test.following.current = false; test.earlyScroll(470, 1130);
  expect(test.node.scrollTop).toBe(1000); expect(test.following.current).toBe(false); test.stop();
});
it('preserves the position when the user is reading earlier messages', () => {
  const test = setup(false); test.resize(500); expect(test.node.scrollTop).toBe(300); test.stop();
});
