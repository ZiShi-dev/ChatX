import { expect, it } from 'vitest';
import { advancingScrollTop } from './chatScroll';

it('does not rewind after the composer or browser has already anchored the new message', () => {
  expect(advancingScrollTop(1100, 1000, 1100, 0.2)).toBe(1100);
  expect(advancingScrollTop(1080, 1000, 1100, 0.2)).toBe(1080);
});
it('clamps immediately to the new bottom when a multiline composer shrinks', () => {
  expect(advancingScrollTop(1100, 1000, 980, 0.2)).toBe(980);
});
it('still advances smoothly to messages added below the viewport', () => {
  expect(advancingScrollTop(1000, 1000, 1100, 0)).toBe(1000);
  expect(advancingScrollTop(1000, 1000, 1100, 0.5)).toBe(1087.5);
  expect(advancingScrollTop(1087.5, 1000, 1100, 1)).toBe(1100);
});
