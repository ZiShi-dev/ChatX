import type pg from 'pg';
import type { AuthRepository, RoomMessage, Upload } from './types.ts';

const messageColumns = `m.id, m.room_id, m.sender_id, m.body, m.created_at, m.deleted, m.event, m.edited_at, m.reply_to,
  (SELECT octet_length(bytes)::int FROM message_images WHERE message_id=m.id) AS image_size,
  (SELECT name FROM message_files WHERE message_id=m.id) AS file_name,
  (SELECT octet_length(bytes)::int FROM message_files WHERE message_id=m.id) AS file_size`;
function mapMessage(row: Record<string, unknown>): RoomMessage {
  return { id: row.id as string, roomId: row.room_id as string, senderId: row.sender_id as string, text: row.body as string,
    createdAt: row.created_at as Date, deleted: row.deleted as boolean, event: row.event as boolean, editedAt: row.edited_at as Date | null,
    replyToId: row.reply_to as string | null, imageSize: row.image_size as number | null, fileName: row.file_name as string | null, fileBytes: row.file_size as number | null };
}
function mapUpload(row: Record<string, unknown>): Upload {
  return { id: row.id as string, roomId: row.room_id as string, ownerId: row.owner_id as string, kind: row.kind as Upload['kind'],
    name: row.name as string, size: row.size as number, sha256: row.sha256 as string, replyToId: row.reply_to as string | null,
    bytes: row.bytes as Uint8Array, expiresAt: row.expires_at as Date };
}

export function createLowBandwidthRepository(pool: pg.Pool): Pick<AuthRepository, 'readRoomSync' | 'beginUpload' | 'readUpload' | 'appendUpload' | 'deleteUpload'> {
  return {
    async deleteUpload(roomId, ownerId, id) { await pool.query('DELETE FROM message_uploads WHERE id=$1 AND room_id=$2 AND owner_id=$3', [id, roomId, ownerId]); },
    async readRoomSync(roomId, userId, cursor) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
        if (!(await client.query('SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2', [roomId, userId])).rowCount) { await client.query('ROLLBACK'); return null; }
        const state = (await client.query<{ epoch: string; revision: string }>('SELECT epoch, revision FROM room_sync WHERE room_id=$1', [roomId])).rows[0];
        // Rooms predating the journal have a stable zero epoch until their first change.
        const epoch = state?.epoch ?? '00000000-0000-0000-0000-000000000000';
        const revision = Number(state?.revision ?? 0);
        const [oldEpoch, oldRevision] = (cursor ?? '').split('.'); const previous = Number(oldRevision);
        const reset = !cursor || oldEpoch !== epoch || !Number.isSafeInteger(previous) || previous > revision || previous < Math.max(0, revision - 1000);
        const changes = reset ? [] : (await client.query<{ revision: string; message_id: string | null; reader_id: string | null }>(
          'SELECT revision, message_id, reader_id FROM room_changes WHERE room_id=$1 AND revision>$2 ORDER BY revision LIMIT 50', [roomId, previous])).rows;
        const next = reset ? revision : changes.length ? Number(changes.at(-1)!.revision) : previous;
        const ids = [...new Set(changes.flatMap((row) => row.message_id ? [row.message_id] : []))];
        const rows = reset ? await client.query(`SELECT ${messageColumns} FROM room_messages m WHERE m.room_id=$1 ORDER BY m.created_at DESC,m.id DESC LIMIT 31`, [roomId])
          : await client.query(`SELECT ${messageColumns} FROM room_messages m WHERE m.room_id=$1 AND m.id=ANY($2::uuid[])`, [roomId, ids]);
        const historyHasMore = reset && rows.rows.length > 30;
        const messages = (reset ? rows.rows.slice(0,30) : rows.rows).map(mapMessage).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
        const readers = await client.query<{ user_id: string; last_read_message_id: string; last_read_at: Date }>(
          `SELECT user_id,last_read_message_id,last_read_at FROM room_members WHERE room_id=$1 AND last_read_message_id IS NOT NULL
           AND ($2::boolean OR user_id=ANY($3::uuid[]))`, [roomId, reset, changes.flatMap((row) => row.reader_id ? [row.reader_id] : [])]);
        const reactions = await client.query<{ message_id: string; user_id: string; emoji: string }>('SELECT message_id,user_id,emoji FROM message_reactions WHERE message_id=ANY($1::uuid[])', [messages.map((item) => item.id)]);
        await client.query('COMMIT');
        return { historyHasMore, messages, reactions: reactions.rows.map((row) => ({ messageId: row.message_id, userId: row.user_id, emoji: row.emoji })),
          readers: readers.rows.map((row) => ({ userId: row.user_id, messageId: row.last_read_message_id, readAt: row.last_read_at })),
          removedIds: ids.filter((id) => !messages.some((message) => message.id === id)), cursor: `${epoch}.${next}`, reset, hasMore: next < revision };
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    },
    async beginUpload(upload, at) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Serialize quota checks per account, including concurrent upload creation.
        await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [upload.ownerId]);
        await client.query('DELETE FROM message_uploads WHERE expires_at <= $1 AND owner_id=$2', [at, upload.ownerId]);
        if (!(await client.query('SELECT 1 FROM room_members WHERE room_id=$1 AND user_id=$2', [upload.roomId, upload.ownerId])).rowCount) { await client.query('ROLLBACK'); return null; }
        const existing = (await client.query('SELECT * FROM message_uploads WHERE id=$1', [upload.id])).rows[0];
        if (existing) { await client.query('COMMIT'); const old = mapUpload(existing); return old.ownerId === upload.ownerId && old.roomId === upload.roomId && old.kind === upload.kind && old.name === upload.name && old.sha256 === upload.sha256 && old.size === upload.size && old.replyToId === upload.replyToId ? old : null; }
        const quota = await client.query('SELECT count(*)::int AS count FROM message_uploads WHERE owner_id=$1', [upload.ownerId]);
        if (quota.rows[0].count >= 40) { await client.query('ROLLBACK'); return null; }
        const result = await client.query(`INSERT INTO message_uploads(id,room_id,owner_id,kind,name,size,sha256,reply_to,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [upload.id, upload.roomId, upload.ownerId, upload.kind, upload.name, upload.size, upload.sha256, upload.replyToId, upload.expiresAt]);
        await client.query('COMMIT'); return mapUpload(result.rows[0]);
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    },
    async readUpload(roomId, ownerId, id, at) {
      const row = (await pool.query(`SELECT u.* FROM message_uploads u JOIN room_members m ON m.room_id=u.room_id AND m.user_id=u.owner_id
        WHERE u.id=$1 AND u.room_id=$2 AND u.owner_id=$3 AND u.expires_at>$4`, [id, roomId, ownerId, at])).rows[0];
      return row ? mapUpload(row) : null;
    },
    async appendUpload(roomId, ownerId, id, offset, bytes, at) {
      const result = await pool.query(`UPDATE message_uploads u SET bytes=u.bytes || $5::bytea WHERE u.id=$1 AND u.room_id=$2 AND u.owner_id=$3
        AND octet_length(u.bytes)=$4 AND octet_length(u.bytes)+octet_length($5::bytea)<=u.size AND u.expires_at>$6
        AND EXISTS(SELECT 1 FROM room_members WHERE room_id=u.room_id AND user_id=u.owner_id) RETURNING *`, [id, roomId, ownerId, offset, Buffer.from(bytes), at]);
      return result.rows[0] ? mapUpload(result.rows[0]) : null;
    },
  };
}
