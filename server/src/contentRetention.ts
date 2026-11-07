import type { Pool } from 'pg';

type DiskMedia = {
  remove(kind: 'image' | 'file', messageId: string): Promise<void>;
};

export type ContentRetentionStatus = {
  enabled: boolean;
  retentionMs: number;
  lastRunAt: string | null;
  lastError: string | null;
  lastDeleted: number;
};

function isoTime(value: Date | string | null | undefined) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

export async function readContentRetention(pool: Pool, retentionMs: number): Promise<ContentRetentionStatus> {
  const result = await pool.query<{
    enabled: boolean;
    last_run_at: Date | string | null;
    last_error: string | null;
    last_deleted: number;
  }>('SELECT enabled, last_run_at, last_error, last_deleted FROM content_retention WHERE id = true');
  const row = result.rows[0];
  return {
    enabled: row?.enabled === true,
    retentionMs,
    lastRunAt: isoTime(row?.last_run_at),
    lastError: typeof row?.last_error === 'string' ? row.last_error.slice(0, 300) : null,
    lastDeleted: Number.isInteger(row?.last_deleted) && row.last_deleted >= 0 ? row.last_deleted : 0,
  };
}

export async function writeContentRetentionEnabled(pool: Pool, enabled: boolean) {
  await pool.query(
    `INSERT INTO content_retention (id, enabled) VALUES (true, $1)
     ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled`,
    [enabled],
  );
}

/** Drops messages older than the deadline, and the photos and files that belong to them. Accounts and rooms stay. */
export async function purgeExpiredContent(pool: Pool, store: DiskMedia, before: Date) {
  const images = await pool.query<{ message_id: string }>(
    `SELECT i.message_id FROM message_images i
     JOIN room_messages m ON m.id = i.message_id
     WHERE m.created_at < $1`,
    [before],
  );
  const files = await pool.query<{ message_id: string }>(
    `SELECT f.message_id FROM message_files f
     JOIN room_messages m ON m.id = f.message_id
     WHERE m.created_at < $1`,
    [before],
  );
  for (const row of images.rows) await store.remove('image', row.message_id);
  for (const row of files.rows) await store.remove('file', row.message_id);
  const deleted = await pool.query('DELETE FROM room_messages WHERE created_at < $1', [before]);
  return deleted.rowCount ?? 0;
}

export async function runContentRetention(pool: Pool, store: DiskMedia, before: Date, retentionMs: number) {
  const state = await readContentRetention(pool, retentionMs);
  if (!state.enabled) return state;
  try {
    const deleted = await purgeExpiredContent(pool, store, before);
    await pool.query(
      'UPDATE content_retention SET last_run_at = now(), last_error = NULL, last_deleted = $1 WHERE id = true',
      [deleted],
    );
    return { ...state, lastDeleted: deleted, lastError: null, lastRunAt: new Date().toISOString() };
  } catch (error) {
    const message = (error instanceof Error ? error.message : 'content retention failed').slice(0, 300);
    await pool.query(
      'UPDATE content_retention SET last_run_at = now(), last_error = $1 WHERE id = true',
      [message],
    ).catch(() => undefined);
    return { ...state, lastError: message, lastRunAt: new Date().toISOString() };
  }
}
