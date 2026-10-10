import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

export async function migrate(pool: Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  for (const id of ['001_auth', '002_hardening', '003_directory', '004_profile', '005_avatar', '006_presence', '007_home', '008_inbox', '009_reactions', '010_chats', '011_inbox_unread', '012_message_images', '013_message_files', '014_room_profiles', '015_group_turns', '016_room_events', '017_turn_notice', '018_low_bandwidth', '019_google_subject', '020_turn_notifications', '021_owner_audit', '022_e2e', '023_e2e_backup_check']) {
    const existing = await pool.query('SELECT id FROM schema_migrations WHERE id = $1', [id]);
    if ((existing.rowCount ?? 0) > 0) continue;
    const sql = await readFile(new URL(`./db/${id}.sql`, import.meta.url), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
