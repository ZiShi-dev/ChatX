import { describe, expect, it } from 'vitest';
import { connectionLabel, readPresenceUsers } from './presence';

const now = new Date('2026-10-08T10:00:00.000Z').getTime();

describe('connectionLabel', () => {
  it('shows a connected account as connected', () => {
    expect(connectionLabel({ status: 'online' }, { self: true, now })).toBe('متصل');
  });

  it('shows someone away as away', () => {
    expect(connectionLabel({ status: 'away' }, { now })).toBe('بعيد');
  });

  it('reads presence from the server and drops a bad row', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(readPresenceUsers({ users: [{ id, status: 'online', lastSeenAt: '2026-10-08T09:15:00.000Z' }] })).toEqual([
      { id, status: 'online', lastSeenAt: '2026-10-08T09:15:00.000Z' },
    ]);
    expect(readPresenceUsers({ users: [{ id, status: 'busy' }] })).toBeNull();
  });

  it('shows the last connection of someone offline', () => {
    const label = connectionLabel({ status: 'offline', lastSeenAt: '2026-10-08T09:15:00.000Z' }, { now });
    expect(label.startsWith('آخر اتصال')).toBe(true);
    expect(label).not.toBe('غير متصل');
  });
});