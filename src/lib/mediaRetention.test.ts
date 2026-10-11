import { expect, it } from 'vitest';
import { formatPurgeCountdown, nextMediaPurgeAt } from './mediaRetention';

it('shows the wait until the next disk sweep as a clock', () => {
  expect(formatPurgeCountdown(0)).toBe('00:00:00');
  expect(formatPurgeCountdown(24 * 60 * 60 * 1000)).toBe('24:00:00');
  expect(formatPurgeCountdown((5 * 60 * 60 + 12 * 60 + 3) * 1000)).toBe('05:12:03');
  expect(nextMediaPurgeAt(null, '2026-10-12T12:00:00.000Z', 86_400_000)).toBe(Date.parse('2026-10-12T12:00:00.000Z'));
  expect(nextMediaPurgeAt('2026-10-11T12:00:00.000Z', null, 86_400_000)).toBe(Date.parse('2026-10-12T12:00:00.000Z'));
});
