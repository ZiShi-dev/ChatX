import { expect, it } from 'vitest';
import { groupTurnStatus } from './groupTurnStatus';

const starts = '2026-10-01T12:00:00Z';
const expired = Date.parse('2026-10-09T12:00:00Z');
it('shows progress only while a refresh is actually pending', () => {
  expect(groupTurnStatus('ليلى', false, expired, starts, 'loading')).toContain('جارٍ');
  for (const result of ['ok', 'offline', 'invalid', 'local'] as const) {
    expect(groupTurnStatus('ليلى', false, expired, starts, result)).not.toContain('جارٍ');
  }
  expect(groupTurnStatus('ليلى', false, expired, starts, 'ok')).toContain('لم تصل');
  expect(groupTurnStatus('ليلى', false, expired, starts, 'offline')).toContain('تعذر الاتصال');
});
it('shows the newly selected holder after the refresh', () => {
  expect(groupTurnStatus('ليلى', false, expired, '2026-10-08T12:00:00Z', 'ok')).toContain('دور ليلى');
  expect(groupTurnStatus('ليلى', false, expired, '2026-10-08T12:00:00Z', 'ok')).not.toContain('انتهى');
});
