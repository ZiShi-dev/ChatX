import { afterEach, expect, it, vi } from 'vitest';
import { resetServerClock, serverNow, syncServerClock } from './serverClock';

afterEach(() => { resetServerClock(); vi.restoreAllMocks(); });
it('uses server time even when the phone clock is weeks ahead and advances monotonically', () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-01T12:00:00Z'));
  let elapsed = 100;
  vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
  const server = Date.parse('2026-10-09T12:00:00Z');
  syncServerClock('Fri, 09 Oct 2026 12:00:00 GMT');
  expect(serverNow()).toBe(server);
  elapsed += 30_000;
  vi.spyOn(Date, 'now').mockReturnValue(0);
  expect(serverNow()).toBe(server + 30_000);
});
it('ignores missing and invalid server dates', () => {
  syncServerClock(null); syncServerClock('invalid');
  expect(Math.abs(serverNow() - Date.now())).toBeLessThan(100);
});
it('does not let a proxy HTTP date override a recent authoritative turn timestamp', () => {
  syncServerClock('2026-10-09T12:00:00Z', true);
  syncServerClock('Sun, 01 Nov 2026 12:00:00 GMT');
  expect(Math.abs(serverNow() - Date.parse('2026-10-09T12:00:00Z'))).toBeLessThan(1000);
});
