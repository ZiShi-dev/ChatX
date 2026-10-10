import type pg from 'pg';
import type { AuthRepository } from './types.ts';

const MAX_ROOM_KEYS = 1000;

export function createKeyRepository(pool: pg.Pool): Pick<AuthRepository, 'readUserKeys' | 'saveUserKeys' | 'listRoomKeys' | 'addRoomKeys'> {
  return {
    async readUserKeys(userId) {
      const row = (await pool.query<{ e2e_public: string | null; salt: string | null; iv: string | null; data: string | null; iterations: number | null }>(
        `SELECT u.e2e_public, b.salt, b.iv, b.data, b.iterations
         FROM users u LEFT JOIN user_key_backups b ON b.user_id = u.id WHERE u.id = $1`, [userId])).rows[0];
      if (!row) return { publicKey: null, backup: null };
      return {
        publicKey: row.e2e_public,
        backup: row.salt && row.iv && row.data && row.iterations ? { salt: row.salt, iv: row.iv, data: row.data, iterations: row.iterations } : null,
      };
    },
    async saveUserKeys(userId, publicKey, backup, reset) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const user = (await client.query<{ e2e_public: string | null }>('SELECT e2e_public FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
        if (!user) { await client.query('ROLLBACK'); return 'missing'; }
        if (user.e2e_public && user.e2e_public !== publicKey && !reset) { await client.query('ROLLBACK'); return 'exists'; }
        if (user.e2e_public !== publicKey) {
          await client.query('UPDATE users SET e2e_public = $2 WHERE id = $1', [userId, publicKey]);
          await client.query('DELETE FROM room_keys WHERE member_id = $1', [userId]);
        }
        await client.query(
          `INSERT INTO user_key_backups (user_id, salt, iv, data, iterations, updated_at) VALUES ($1, $2, $3, $4, $5, now())
           ON CONFLICT (user_id) DO UPDATE SET salt = EXCLUDED.salt, iv = EXCLUDED.iv, data = EXCLUDED.data,
             iterations = EXCLUDED.iterations, updated_at = now()`,
          [userId, backup.salt, backup.iv, backup.data, backup.iterations]);
        await client.query('COMMIT');
        return 'ok';
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    },
    async listRoomKeys(roomId, userId) {
      if (!(await pool.query('SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, userId])).rowCount) return null;
      const [members, keys, mine] = await Promise.all([
        pool.query<{ id: string; e2e_public: string | null }>(
          'SELECT u.id, u.e2e_public FROM room_members rm JOIN users u ON u.id = rm.user_id WHERE rm.room_id = $1 ORDER BY u.id', [roomId]),
        pool.query<{ key_id: string; created_at: Date; member_ids: string[] }>(
          `SELECT key_id, min(created_at) AS created_at, array_agg(member_id ORDER BY member_id) AS member_ids
           FROM room_keys WHERE room_id = $1 GROUP BY key_id ORDER BY min(created_at) DESC, key_id DESC LIMIT 50`, [roomId]),
        pool.query<{ key_id: string; wrapper_public: string; wrapped: string }>(
          'SELECT key_id, wrapper_public, wrapped FROM room_keys WHERE room_id = $1 AND member_id = $2 ORDER BY created_at DESC LIMIT 200', [roomId, userId]),
      ]);
      return {
        members: members.rows.map((row) => ({ id: row.id, publicKey: row.e2e_public })),
        keys: keys.rows.map((row) => ({ keyId: row.key_id, createdAt: row.created_at, memberIds: row.member_ids })),
        mine: mine.rows.map((row) => ({ keyId: row.key_id, wrapperPublic: row.wrapper_public, wrapped: row.wrapped })),
      };
    },
    async addRoomKeys(roomId, userId, wraps, at) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM rooms WHERE id = $1 FOR UPDATE', [roomId]);
        const actor = (await client.query<{ e2e_public: string | null }>(
          'SELECT u.e2e_public FROM room_members rm JOIN users u ON u.id = rm.user_id WHERE rm.room_id = $1 AND rm.user_id = $2', [roomId, userId])).rows[0];
        if (!actor) { await client.query('ROLLBACK'); return 'missing'; }
        if (!actor.e2e_public) { await client.query('ROLLBACK'); return 'invalid'; }
        const members = new Set((await client.query<{ user_id: string }>(
          'SELECT rm.user_id FROM room_members rm JOIN users u ON u.id = rm.user_id WHERE rm.room_id = $1 AND u.e2e_public IS NOT NULL', [roomId])).rows.map((row) => row.user_id));
        if (wraps.some((wrap) => !members.has(wrap.memberId))) { await client.query('ROLLBACK'); return 'invalid'; }
        const keyIds = [...new Set(wraps.map((wrap) => wrap.keyId))];
        const known = (await client.query<{ key_id: string; held: boolean }>(
          `SELECT key_id, bool_or(member_id = $3) AS held FROM room_keys WHERE room_id = $1 AND key_id = ANY($2::uuid[]) GROUP BY key_id`,
          [roomId, keyIds, userId])).rows;
        for (const keyId of keyIds) {
          const row = known.find((item) => item.key_id === keyId);
          // A sender may only extend a key it already holds, or start a new key that includes itself.
          if (row ? !row.held : !wraps.some((wrap) => wrap.keyId === keyId && wrap.memberId === userId)) { await client.query('ROLLBACK'); return 'invalid'; }
        }
        const fresh = keyIds.filter((keyId) => !known.some((row) => row.key_id === keyId)).length;
        if (fresh) {
          const count = (await client.query<{ count: number }>('SELECT count(DISTINCT key_id)::int AS count FROM room_keys WHERE room_id = $1', [roomId])).rows[0]?.count ?? 0;
          if (count + fresh > MAX_ROOM_KEYS) { await client.query('ROLLBACK'); return 'invalid'; }
        }
        for (const wrap of wraps) {
          await client.query(
            `INSERT INTO room_keys (room_id, key_id, member_id, wrapper_id, wrapper_public, wrapped, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
            [roomId, wrap.keyId, wrap.memberId, userId, actor.e2e_public, wrap.wrapped, at]);
        }
        await client.query('COMMIT');
        return 'ok';
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    },
  };
}
