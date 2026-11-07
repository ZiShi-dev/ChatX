import assert from 'node:assert/strict';
import test from 'node:test';
import { purgeExpiredContent, runContentRetention } from '../src/contentRetention.ts';

test('removes old messages and the photos and files that belong to them', async () => {
  const removed: string[] = [];
  const sql: string[] = [];
  const pool = {
    query: async (text: string) => {
      sql.push(text);
      if (text.includes('FROM message_images')) return { rows: [{ message_id: 'photo' }] };
      if (text.includes('FROM message_files')) return { rows: [{ message_id: 'clip' }] };
      if (text.startsWith('DELETE FROM room_messages')) return { rowCount: 4 };
      return { rows: [] };
    },
  };
  const count = await purgeExpiredContent(pool as never, {
    remove: async (kind, id) => { removed.push(`${kind}:${id}`); },
  }, new Date('2026-11-06T14:00:00Z'));
  assert.equal(count, 4);
  assert.deepEqual(removed, ['image:photo', 'file:clip']);
  assert.match(sql.at(-1) ?? '', /DELETE FROM room_messages WHERE created_at < \$1/);
  assert.equal(sql.some((item) => item.includes('DELETE FROM users') || item.includes('DELETE FROM rooms')), false);
});

test('leaves every message in place while the switch is off', async () => {
  const pool = {
    query: async (text: string) => {
      if (text.startsWith('DELETE') || text.startsWith('UPDATE')) throw new Error(text);
      return { rows: [{ enabled: false, last_run_at: null, last_error: null, last_deleted: 0 }] };
    },
  };
  const status = await runContentRetention(pool as never, { remove: async () => { throw new Error('disk'); } }, new Date(), 86_400_000);
  assert.equal(status.enabled, false);
  assert.equal(status.lastDeleted, 0);
});
