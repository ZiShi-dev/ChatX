import { createLowBandwidthRepository } from './lowBandwidth.ts';
import { randomInt } from 'node:crypto';
import pg from 'pg';
import { GLOBAL_ROOM_ID } from './home.ts';
import { GROUP_TURN_MS, resolveGroupTurn } from './groupTurn.ts';
import { messageKind } from './inbox.ts';
import type { AuthRepository, AuthRole, AuthUser, HomeRoom, InboxNotice, ProfilePatch, RoomKind, RoomMessage, SavedItem } from './types.ts';

async function syncTurn(client: pg.PoolClient, roomId: string, at: Date) {
  const result = await client.query<{ kind: string; turn_user_id: string | null; turn_opens_at: Date | null; turn_round: number }>(
    'SELECT kind, turn_user_id, turn_opens_at, turn_round FROM rooms WHERE id = $1 FOR UPDATE', [roomId]);
  const current = result.rows[0];
  if (!current || !['group', 'global'].includes(current.kind)) return null;
  const people = await client.query<{ user_id: string }>('SELECT user_id FROM room_members WHERE room_id = $1', [roomId]);
  const round = current.turn_round || 1;
  const done = await client.query<{ user_id: string }>('SELECT user_id FROM group_turn_done WHERE room_id = $1 AND round = $2', [roomId, round]);
  const turn = resolveGroupTurn({ members: people.rows.map((row) => row.user_id), holderId: current.turn_user_id,
    opensAt: current.turn_opens_at?.getTime() ?? at.getTime(), round, done: done.rows.map((row) => row.user_id), now: at.getTime(), random: randomInt });
  if (!turn) return null;
  if (current.turn_user_id !== turn.holderId || current.turn_opens_at?.getTime() !== turn.opensAt || current.turn_round !== turn.round) {
    await client.query('UPDATE rooms SET turn_user_id = $2, turn_opens_at = $3, turn_round = $4, turn_notice_for = NULL WHERE id = $1',
      [roomId, turn.holderId, new Date(turn.opensAt), turn.round]);
    await client.query('DELETE FROM group_turn_done WHERE room_id = $1', [roomId]);
    if (turn.done.length) await client.query(
      'INSERT INTO group_turn_done (room_id, round, user_id) SELECT $1, $2, member_id FROM unnest($3::uuid[]) AS member_id ON CONFLICT DO NOTHING',
      [roomId, turn.round, turn.done]);
  }
  return turn;
}

type UserRow = {
  google_sub: string | null;
  id: string;
  email: string;
  display_name: string;
  username: string;
  role: string;
  bio: string;
  banner: string | null;
  avatar: string | null;
};

const USER_COLUMNS = 'id, email, display_name, username, role, bio, banner, avatar, google_sub';

function byteSizeOf(value: unknown, max: number) {
  const size = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(size) || size < 1 || size > max) return null;
  return size;
}

function imageSizeOf(value: unknown) {
  return byteSizeOf(value, 60_000);
}

function fileSizeOf(value: unknown) {
  return byteSizeOf(value, 262_144);
}

function jpegBytes(value: unknown): Uint8Array | null {
  const bytes = Buffer.isBuffer(value) ? value : null;
  if (!bytes || bytes.length < 3 || bytes.length > 60_000) return null;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  return bytes;
}

function asRole(value: string): AuthRole {
  if (value === 'creator' || value === 'admin' || value === 'member') return value;
  throw new Error('invalid role');
}

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    username: row.username,
    role: asRole(row.role),
    bio: row.bio ?? '',
    bannerUrl: row.banner,
    avatarUrl: row.avatar,
    googleSub: row.google_sub,
  };
}

function isUnique(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export function createPool(databaseUrl: string) {
  return new pg.Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis:5000, idleTimeoutMillis:30000, statement_timeout:10000, idle_in_transaction_session_timeout:10000 });
}

export function createPostgresRepository(pool: pg.Pool): AuthRepository {
  return {
    ...createLowBandwidthRepository(pool),
    async findUserByGoogleSub(sub) {
      const result=await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE google_sub=$1`,[sub]);
      return result.rows[0]?mapUser(result.rows[0]):null;
    },
    async bindGoogleSub(id,sub) {
      try {return !!(await pool.query('UPDATE users SET google_sub=$2 WHERE id=$1 AND role=\'member\' AND (google_sub IS NULL OR google_sub=$2)',[id,sub])).rowCount;}
      catch(error){if(isUnique(error))return false;throw error;}
    },
    async findUserById(id) {
      const result = await pool.query<UserRow>(
        `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
        [id],
      );
      const row = result.rows[0];
      return row ? mapUser(row) : null;
    },
    async listUsers() {
      const result = await pool.query<UserRow>(
        `SELECT ${USER_COLUMNS} FROM users ORDER BY created_at ASC`,
      );
      return result.rows.map(mapUser);
    },
    async insertUser(user) {
      await pool.query(
        `INSERT INTO users (id, email, display_name, username, role, password_hash, totp_enabled, google_sub)
         VALUES ($1, $2, $3, $4, 'member', null, false, $5)`,
        [user.id, user.email, user.displayName, user.username,user.googleSub??null],
      );
    },
    async renameMember(id, displayName) {
      try {
        const result = await pool.query(
          `UPDATE users SET display_name = $2, username = $2 WHERE id = $1 AND role = 'member'`,
          [id, displayName],
        );
        return (result.rowCount ?? 0) > 0 ? 'ok' : 'missing';
      } catch (error) {
        if (isUnique(error)) return 'taken';
        throw error;
      }
    },
    async updateMemberProfile(id, patch: ProfilePatch) {
      try {
        const result = await pool.query(
          `UPDATE users
           SET display_name = CASE WHEN $2::bool THEN $3 ELSE display_name END,
               username = CASE WHEN $2::bool THEN $3 ELSE username END,
               bio = CASE WHEN $4::bool THEN $5 ELSE bio END,
               banner = CASE WHEN $6::bool THEN $7 ELSE banner END,
               avatar = CASE WHEN $8::bool THEN $9 ELSE avatar END
           WHERE id = $1 AND role = 'member'`,
          [
            id,
            patch.displayName !== undefined,
            patch.displayName ?? '',
            patch.bio !== undefined,
            patch.bio ?? '',
            patch.banner !== undefined,
            patch.banner ?? null,
            patch.avatar !== undefined,
            patch.avatar ?? null,
          ],
        );
        return (result.rowCount ?? 0) > 0 ? 'ok' : 'missing';
      } catch (error) {
        if (isUnique(error)) return 'taken';
        throw error;
      }
    },
    async createSession(tokenHash, userId, expiresAt) {
      await pool.query(
        `INSERT INTO sessions (token_hash, user_id, totp_verified, expires_at, created_at, last_seen_at)
         VALUES ($1, $2, true, $3, now(), now())`,
        [tokenHash, userId, expiresAt],
      );
    },
    async findSessionUser(tokenHash, now) {
      const result = await pool.query<UserRow>(
        `SELECT ${USER_COLUMNS.split(', ').map((column) => `u.${column}`).join(', ')}
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > $2`,
        [tokenHash, now],
      );
      const row = result.rows[0];
      if (row) return mapUser(row);
      await pool.query('DELETE FROM sessions WHERE token_hash = $1 AND expires_at <= $2', [tokenHash, now]);
      return null;
    },
    async deleteSession(tokenHash) {
      await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
    },
    async touchPresence(tokenHash, presence, now) {
      const result = await pool.query(
        `UPDATE sessions SET last_seen_at = $3, presence = $2 WHERE token_hash = $1 AND expires_at > $3`,
        [tokenHash, presence, now],
      );
      return (result.rowCount ?? 0) > 0;
    },
    async ensureHome(userId) {
      await pool.query(
        `INSERT INTO rooms (id, kind, name, created_at)
         VALUES ($1, 'global', 'ChatX', '2026-01-01T00:00:00Z')
         ON CONFLICT (id) DO NOTHING`,
        [GLOBAL_ROOM_ID],
      );
      await pool.query(
        `INSERT INTO room_members (room_id, user_id)
         SELECT $1, id FROM users WHERE role = 'member'
         ON CONFLICT DO NOTHING`,
        [GLOBAL_ROOM_ID],
      );
      await pool.query(
        `INSERT INTO room_members (room_id, user_id)
         SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM users WHERE id = $2 AND role = 'member')
         ON CONFLICT DO NOTHING`,
        [GLOBAL_ROOM_ID, userId],
      );
    },
    async readGroupTurn(roomId, userId, at) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const membership = await client.query('SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
        if (!membership.rowCount) { await client.query('ROLLBACK'); return null; }
        const turn = await syncTurn(client, roomId, at);
        const people = await client.query<{ user_id: string }>('SELECT user_id FROM room_members WHERE room_id = $1', [roomId]);
        await client.query('COMMIT');
        return turn ? { ...turn, members: people.rows.map((row) => row.user_id) } : null;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async listHome(userId, at = new Date()) {
      const result = await pool.query<{
        id: string;
        kind: RoomKind;
        name: string | null;
        admin_id: string | null;
        bio: string;
        avatar_url: string | null;
        banner_url: string | null;
        turn_user_id: string | null;
        turn_opens_at: Date | null;
        created_at: Date;
        unread_count: number;
        participant_ids: string[];
        last_id: string | null;
        last_sender_id: string | null;
        last_body: string | null;
        last_created_at: Date | null;
        last_deleted: boolean | null;
        last_event: boolean | null;
        last_image_size: number | null;
        last_file_name: string | null;
        last_file_size: number | null;
      }>(
        `SELECT r.id, r.kind, r.name, r.created_at, r.admin_id, r.bio, r.avatar_url, r.banner_url, r.turn_user_id, r.turn_opens_at,
                (
                  SELECT COUNT(*)::int FROM room_messages m
                  WHERE m.room_id = r.id AND m.sender_id <> $1 AND NOT m.deleted
                    AND (rm.last_read_message_id IS NULL OR (m.created_at, m.id) >
                         (SELECT cursor.created_at, cursor.id FROM room_messages cursor WHERE cursor.id = rm.last_read_message_id))
                ) AS unread_count,
                (
                  SELECT COALESCE(array_agg(member.user_id ORDER BY member.user_id), '{}')
                  FROM room_members member WHERE member.room_id = r.id
                ) AS participant_ids,
                last.id AS last_id,
                last.sender_id AS last_sender_id,
                last.body AS last_body,
                last.created_at AS last_created_at,
                last.deleted AS last_deleted,
                last.event AS last_event,
                (SELECT octet_length(i.bytes)::int FROM message_images i WHERE i.message_id = last.id) AS last_image_size,
                (SELECT f.name FROM message_files f WHERE f.message_id = last.id) AS last_file_name,
                (SELECT octet_length(f.bytes)::int FROM message_files f WHERE f.message_id = last.id) AS last_file_size
         FROM rooms r
         JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = $1
         LEFT JOIN LATERAL (
           SELECT id, sender_id, body, created_at, deleted, event
           FROM room_messages
           WHERE room_id = r.id
           ORDER BY created_at DESC
           LIMIT 1
         ) last ON true
         ORDER BY CASE WHEN r.kind = 'global' THEN 0 ELSE 1 END, last.created_at DESC NULLS LAST`,
        [userId],
      );
      const rooms = result.rows.map((row): HomeRoom => ({
        id: row.id,
        kind: row.kind,
        name: row.name,
        adminId: row.admin_id,
        bio: row.bio,
        avatarUrl: row.avatar_url,
        bannerUrl: row.banner_url,
        turnUserId: row.turn_user_id,
        turnOpensAt: row.turn_opens_at,
        createdAt: row.created_at,
        unreadCount: row.unread_count,
        participantIds: row.participant_ids ?? [],
        lastMessage: row.last_id && row.last_sender_id && row.last_body !== null && row.last_created_at
          ? {
              id: row.last_id,
              roomId: row.id,
              senderId: row.last_sender_id,
              text: row.last_body,
              createdAt: row.last_created_at,
              deleted: Boolean(row.last_deleted),
              event: Boolean(row.last_event),
              imageSize: imageSizeOf(row.last_image_size),
              fileName: row.last_file_name,
              fileBytes: fileSizeOf(row.last_file_size),
            }
          : null,
      }));
      for (const room of rooms) {
        if ((room.kind !== 'group' && room.kind !== 'global') || room.participantIds.length === 0) continue;
        if (room.turnUserId && room.participantIds.includes(room.turnUserId) && room.turnOpensAt
          && (room.participantIds.length === 1 || at.getTime() < room.turnOpensAt.getTime() + GROUP_TURN_MS)) continue;
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const turn = await syncTurn(client, room.id, at);
          await client.query('COMMIT');
          if (turn) { room.turnUserId = turn.holderId; room.turnOpensAt = new Date(turn.opensAt); }
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
      }
      return rooms;
    },
    async listRoomMessages(roomId, userId, limit, page) {
      const member = await pool.query('SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
      if ((member.rowCount ?? 0) === 0) return null;
      const result = await pool.query<{ id: string; sender_id: string; body: string; created_at: Date; deleted: boolean; event: boolean; edited_at: Date | null; reply_to: string | null; image_size: number | null; file_name: string | null; file_size: number | null }>(
        `SELECT recent.id, recent.sender_id, recent.body, recent.created_at, recent.deleted, recent.event, recent.edited_at, recent.reply_to,
                (SELECT octet_length(i.bytes)::int FROM message_images i WHERE i.message_id = recent.id) AS image_size,
                (SELECT f.name FROM message_files f WHERE f.message_id = recent.id) AS file_name,
                (SELECT octet_length(f.bytes)::int FROM message_files f WHERE f.message_id = recent.id) AS file_size
         FROM (
           SELECT id, sender_id, body, created_at, deleted, event, edited_at, reply_to
           FROM room_messages WHERE room_id = $1
             AND ($3::uuid IS NULL OR (created_at, id) < (SELECT created_at, id FROM room_messages WHERE id = $3 AND room_id = $1))
             AND ($4::uuid IS NULL OR (created_at, id) <= (SELECT created_at, id FROM room_messages WHERE id = $4 AND room_id = $1))
           ORDER BY created_at DESC, id DESC
           LIMIT $2
         ) recent
         ORDER BY recent.created_at ASC, recent.id ASC`,
        [roomId, limit, page?.beforeId ?? null, page?.aroundId ?? null],
      );
      return result.rows.map((row): RoomMessage => ({
        id: row.id,
        roomId,
        senderId: row.sender_id,
        text: row.body,
        createdAt: row.created_at,
        deleted: row.deleted,
        event: row.event,
        editedAt: row.edited_at,
        replyToId: row.reply_to,
        imageSize: imageSizeOf(row.image_size),
        fileName: row.file_name,
        fileBytes: fileSizeOf(row.file_size),
      }));
    },
    async addRoomMessage(message, image, file) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await (async (): Promise<RoomMessage | 'missing' | 'invalid'> => {
      const member = await client.query('SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2', [message.roomId, message.senderId]);
      if ((member.rowCount ?? 0) === 0) return 'missing';
      const inserted = await client.query<{ reply_to: string | null }>(
        `INSERT INTO room_messages (id, room_id, sender_id, body, created_at, reply_to, event)
         VALUES ($1, $2, $3, $4, $5, (SELECT id FROM room_messages WHERE id = $6 AND room_id = $2), $7)
         ON CONFLICT (id) DO NOTHING
         RETURNING reply_to`,
        [message.id, message.roomId, message.senderId, message.text, message.createdAt, message.replyToId ?? null, Boolean(message.event)],
      );
      if ((inserted.rowCount ?? 0) > 0) {
        if (image?.byteLength) {
          await client.query('INSERT INTO message_images (message_id, bytes) VALUES ($1, $2)', [message.id, Buffer.from(image)]);
        }
        if (file?.bytes.byteLength) {
          await client.query('INSERT INTO message_files (message_id, name, bytes) VALUES ($1, $2, $3)', [message.id, file.name, Buffer.from(file.bytes)]);
        }
        return {
          ...message,
          replyToId: inserted.rows[0]?.reply_to ?? null,
          imageSize: image?.byteLength ?? null,
          fileName: file?.name ?? null,
          fileBytes: file?.bytes.byteLength ?? null,
        };
      }
      const existing = await client.query<{ room_id: string; sender_id: string; body: string; created_at: Date; deleted: boolean; reply_to: string | null; image_size: number | null; file_name: string | null; file_size: number | null }>(
        `SELECT room_id, sender_id, body, created_at, deleted, reply_to,
                (SELECT octet_length(bytes)::int FROM message_images WHERE message_id = room_messages.id) AS image_size,
                (SELECT name FROM message_files WHERE message_id = room_messages.id) AS file_name,
                (SELECT octet_length(bytes)::int FROM message_files WHERE message_id = room_messages.id) AS file_size
         FROM room_messages WHERE id = $1`,
        [message.id],
      );
      const row = existing.rows[0];
      if (!row || row.room_id !== message.roomId || row.sender_id !== message.senderId) return 'invalid';
      return {
        ...message,
        text: row.body,
        createdAt: row.created_at,
        deleted: row.deleted,
        replyToId: row.reply_to,
        imageSize: row.deleted ? null : imageSizeOf(row.image_size),
        fileName: row.deleted ? null : row.file_name,
        fileBytes: row.deleted ? null : fileSizeOf(row.file_size),
      };
        })();
        if (result === 'missing' || result === 'invalid') await client.query('ROLLBACK');
        else await client.query('COMMIT');
        return result;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async readMessageImage(roomId, userId, messageId) {
      const result = await pool.query<{ bytes: Buffer }>(
        `SELECT i.bytes
         FROM message_images i
         JOIN room_messages m ON m.id = i.message_id
         JOIN room_members rm ON rm.room_id = m.room_id AND rm.user_id = $3
         WHERE i.message_id = $2 AND m.room_id = $1 AND NOT m.deleted`,
        [roomId, messageId, userId],
      );
      return jpegBytes(result.rows[0]?.bytes);
    },
    async readMessageFile(roomId, userId, messageId) {
      const result = await pool.query<{ name: string; bytes: Buffer }>(
        `SELECT f.name, f.bytes
         FROM message_files f
         JOIN room_messages m ON m.id = f.message_id
         JOIN room_members rm ON rm.room_id = m.room_id AND rm.user_id = $3
         WHERE f.message_id = $2 AND m.room_id = $1 AND NOT m.deleted`,
        [roomId, messageId, userId],
      );
      const row = result.rows[0];
      if (!row || !Buffer.isBuffer(row.bytes) || row.bytes.length < 1 || row.bytes.length > 262_144) return null;
      if (!row.name || row.name.length > 120) return null;
      return { name: row.name, bytes: row.bytes };
    },
    async claimTurnNotice(roomId, holderId) {
      const result = await pool.query(
        `UPDATE rooms SET turn_notice_for = $2
         WHERE id = $1 AND kind IN ('group', 'global') AND turn_user_id = $2
           AND turn_notice_for IS DISTINCT FROM $2
           AND (SELECT COUNT(*) FROM room_members WHERE room_id = $1) > 1`,
        [roomId, holderId],
      );
      return (result.rowCount ?? 0) > 0;
    },
    async notifyTurnMembers(message) {
      await pool.query(
        `INSERT INTO notifications (user_id, message_id, room_id, kind, created_at)
         SELECT rm.user_id, $1, $2, 'signal', $3
         FROM room_members rm WHERE rm.room_id = $2
         ON CONFLICT (user_id, message_id, kind) DO NOTHING`,
        [message.id, message.roomId, message.createdAt],
      );
    },
    async notifyRoomMessage(message) {
      const members = await pool.query<{ id: string; username: string }>(
        `SELECT u.id, u.username
         FROM room_members rm
         JOIN users u ON u.id = rm.user_id
         WHERE rm.room_id = $1 AND u.id <> $2`,
        [message.roomId, message.senderId],
      );
      const parent = message.replyToId
        ? await pool.query<{ sender_id: string }>('SELECT sender_id FROM room_messages WHERE id = $1 AND room_id = $2', [message.replyToId, message.roomId])
        : null;
      const parentSender = parent?.rows[0]?.sender_id ?? '';
      for (const member of members.rows) {
        await pool.query(
          `INSERT INTO notifications (user_id, message_id, room_id, kind, created_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, message_id, kind) DO NOTHING`,
          [member.id, message.id, message.roomId, messageKind(message.text, member.username, parentSender === member.id), message.createdAt],
        );
      }
    },
    async listNotifications(userId, limit, before) {
      const result = await pool.query<{ message_id: string; room_id: string; conversation_name: string; sender_id: string; sender_name: string; kind: InboxNotice['kind']; body: string; created_at: Date; read: boolean; deleted: boolean }>(
        `SELECT n.message_id, n.room_id,
                CASE
                  WHEN r.kind = 'private' THEN COALESCE((
                    SELECT ou.display_name FROM room_members om
                    JOIN users ou ON ou.id = om.user_id
                    WHERE om.room_id = r.id AND om.user_id <> $1
                    LIMIT 1
                  ), 'محادثة خاصة')
                  ELSE COALESCE(r.name, 'ChatX')
                END AS conversation_name,
                COALESCE(n.actor_id, m.sender_id) AS sender_id,
                COALESCE(actor.display_name, u.display_name) AS sender_name,
                n.kind,
                CASE
                  WHEN m.deleted THEN ''
                  WHEN n.kind = 'reaction' THEN COALESCE(react.emoji, '')
                  WHEN EXISTS (SELECT 1 FROM message_files f WHERE f.message_id = m.id)
                    THEN (SELECT f.name FROM message_files f WHERE f.message_id = m.id)
                  WHEN EXISTS (SELECT 1 FROM message_images i WHERE i.message_id = m.id) THEN 'صورة'
                  ELSE m.body
                END AS body,
                n.created_at, n.read_at IS NOT NULL AS read, m.deleted
         FROM notifications n
         JOIN room_messages m ON m.id = n.message_id
         JOIN rooms r ON r.id = n.room_id
         JOIN users u ON u.id = m.sender_id
         LEFT JOIN users actor ON actor.id = n.actor_id
         LEFT JOIN message_reactions react ON react.message_id = n.message_id AND react.user_id = n.actor_id
         LEFT JOIN inbox_state s ON s.user_id = n.user_id
         WHERE n.user_id = $1
           AND (s.cleared_at IS NULL OR n.created_at > s.cleared_at)
           AND ($3::timestamptz IS NULL OR n.created_at < $3 OR (n.created_at = $3 AND n.message_id < $4::uuid))
         ORDER BY n.created_at DESC, n.message_id DESC
         LIMIT $2`,
        [userId, limit, before?.at ?? null, before?.messageId ?? null],
      );
      return result.rows.map((row): InboxNotice => ({
        messageId: row.message_id,
        roomId: row.room_id,
        conversationName: row.conversation_name,
        senderId: row.sender_id,
        senderName: row.sender_name,
        kind: row.kind,
        text: row.body,
        createdAt: row.created_at,
        read: row.read,
        deleted: row.deleted,
      }));
    },
    async countUnreadNotifications(userId) {
      const result = await pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM notifications n
         LEFT JOIN inbox_state s ON s.user_id = n.user_id
         WHERE n.user_id = $1 AND n.read_at IS NULL
           AND (s.cleared_at IS NULL OR n.created_at > s.cleared_at)`,
        [userId],
      );
      return result.rows[0]?.count ?? 0;
    },
    async markNotificationsRead(userId, ids, now) {
      if (ids === 'all') {
        await pool.query('UPDATE notifications SET read_at = $2 WHERE user_id = $1 AND read_at IS NULL', [userId, now]);
        return;
      }
      if (ids.length === 0) return;
      await pool.query(
        'UPDATE notifications SET read_at = $3 WHERE user_id = $1 AND message_id = ANY($2::uuid[]) AND read_at IS NULL',
        [userId, ids, now],
      );
    },
    async clearNotifications(userId, now) {
      await pool.query(
        `INSERT INTO inbox_state (user_id, cleared_at) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET cleared_at = EXCLUDED.cleared_at`,
        [userId, now],
      );
      await pool.query('UPDATE notifications SET read_at = $2 WHERE user_id = $1 AND read_at IS NULL AND created_at <= $2', [userId, now]);
    },
    async markRoomRead(roomId, userId, now, messageId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const target = await client.query<{ created_at: Date }>(
          `SELECT m.created_at FROM room_messages m JOIN room_members rm ON rm.room_id = m.room_id AND rm.user_id = $2
           WHERE m.room_id = $1 AND m.id = $3`, [roomId, userId, messageId]);
        if (!target.rows[0]) { await client.query('ROLLBACK'); return false; }
        await client.query(
          `UPDATE room_members rm SET last_read_at = $4, last_read_message_id = $3
           WHERE room_id = $1 AND user_id = $2 AND (last_read_message_id IS NULL OR
             (SELECT (created_at, id) FROM room_messages WHERE id = rm.last_read_message_id) <
             (SELECT (created_at, id) FROM room_messages WHERE id = $3))`,
          [roomId, userId, messageId, target.rows[0].created_at]);
        await client.query(
          `UPDATE notifications n SET read_at = $4 WHERE user_id = $2 AND room_id = $1 AND kind <> 'reaction' AND read_at IS NULL
           AND message_id IN (SELECT id FROM room_messages WHERE room_id = $1 AND (created_at, id) <=
             (SELECT created_at, id FROM room_messages WHERE id = $3))`, [roomId, userId, messageId, now]);
        await client.query('COMMIT');
        return true;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async changeRoomMessage(roomId, userId, messageId, text, at) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          `UPDATE room_messages m SET body = COALESCE($4, ''), deleted = ($4::text IS NULL), edited_at = $5
           WHERE id = $3 AND room_id = $1 AND sender_id = $2
             AND EXISTS (SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2)
             AND NOT m.event
             AND ($4::text IS NULL OR (NOT deleted AND NOT EXISTS (SELECT 1 FROM message_images WHERE message_id = $3)
               AND NOT EXISTS (SELECT 1 FROM message_files WHERE message_id = $3)))`, [roomId, userId, messageId, text, at]);
        if (text === null && (result.rowCount ?? 0) > 0) {
          await client.query('DELETE FROM message_images WHERE message_id = $1', [messageId]);
          await client.query('DELETE FROM message_files WHERE message_id = $1', [messageId]);
          await client.query('DELETE FROM message_reactions WHERE message_id = $1', [messageId]);
        }
        await client.query('COMMIT');
        return (result.rowCount ?? 0) > 0;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async updateRoom(roomId, userId, patch, at) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const member = await client.query('SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
        if ((member.rowCount ?? 0) === 0) {
          await client.query('ROLLBACK');
          return false;
        }
        const next = await syncTurn(client, roomId, at);
        if (!next || next.holderId !== userId || at.getTime() < next.opensAt) {
          // A rejected former holder must still commit the elapsed-time rotation.
          await client.query('COMMIT');
          return false;
        }
        await client.query(
          `UPDATE rooms SET name = COALESCE($2, name), bio = COALESCE($3, bio),
           avatar_url = CASE WHEN $4::boolean THEN $5 ELSE avatar_url END,
           banner_url = CASE WHEN $6::boolean THEN $7 ELSE banner_url END,
           turn_user_id = $8, turn_opens_at = $9, turn_round = $10
           WHERE id = $1 AND kind IN ('group', 'global')`,
          [roomId, patch.name ?? null, patch.bio ?? null, patch.avatar !== undefined, patch.avatar ?? null, patch.banner !== undefined, patch.banner ?? null, next.holderId, new Date(next.opensAt), next.round],
        );
        await client.query('COMMIT');
        return true;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async setReaction({ roomId, messageId, userId, emoji, at }) {
      const member = await pool.query('SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, userId]);
      if ((member.rowCount ?? 0) === 0) return 'missing';
      const message = await pool.query<{ sender_id: string }>(
        'SELECT sender_id FROM room_messages WHERE id = $1 AND room_id = $2 AND NOT deleted AND NOT event',
        [messageId, roomId],
      );
      const authorId = message.rows[0]?.sender_id;
      if (!authorId) return 'missing';
      if (emoji) {
        await pool.query(
          `INSERT INTO message_reactions (message_id, user_id, emoji, created_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = EXCLUDED.created_at`,
          [messageId, userId, emoji, at],
        );
      } else {
        await pool.query('DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2', [messageId, userId]);
      }
      if (authorId === userId) return 'ok';
      const publish = async (actorId: string) => {
        await pool.query(
          `INSERT INTO notifications (user_id, message_id, room_id, kind, actor_id, created_at)
           VALUES ($1, $2, $3, 'reaction', $4, $5)
           ON CONFLICT (user_id, message_id, kind) DO UPDATE
           SET actor_id = EXCLUDED.actor_id, created_at = EXCLUDED.created_at, read_at = NULL`,
          [authorId, messageId, roomId, actorId, at],
        );
      };
      if (emoji) {
        await publish(userId);
        return 'ok';
      }
      const removed = await pool.query(
        `DELETE FROM notifications WHERE user_id = $1 AND message_id = $2 AND kind = 'reaction' AND actor_id = $3`,
        [authorId, messageId, userId],
      );
      if ((removed.rowCount ?? 0) === 0) return 'ok';
      const latest = await pool.query<{ user_id: string }>(
        'SELECT user_id FROM message_reactions WHERE message_id = $1 AND user_id <> $2 ORDER BY created_at DESC LIMIT 1',
        [messageId, authorId],
      );
      const actorId = latest.rows[0]?.user_id;
      if (actorId) await publish(actorId);
      return 'ok';
    },
    async listReactions(roomId, messageIds) {
      const result = await pool.query<{ message_id: string; user_id: string; emoji: string }>(
        `SELECT r.message_id, r.user_id, r.emoji
         FROM message_reactions r
         JOIN room_messages m ON m.id = r.message_id
         WHERE m.room_id = $1 AND NOT m.deleted AND ($2::uuid[] IS NULL OR m.id = ANY($2::uuid[]))`,
        [roomId, messageIds ?? null],
      );
      return result.rows.map((row) => ({ messageId: row.message_id, userId: row.user_id, emoji: row.emoji }));
    },
    async createRoom({ id, kind, name, creatorId, memberIds, at }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await (async (): Promise<string | 'invalid'> => {
      const others = [...new Set(memberIds)].filter((userId) => userId !== creatorId);
      const ids = [creatorId, ...others];
      const found = await client.query('SELECT id FROM users WHERE role = $1 AND id = ANY($2::uuid[])', ['member', ids]);
      if ((found.rowCount ?? 0) !== ids.length) return 'invalid';
      if (kind === 'private') {
        if (others.length !== 1) return 'invalid';
        const pairKey = [creatorId, others[0]].sort().join(':');
        const existing = await client.query<{ id: string }>('SELECT id FROM rooms WHERE pair_key = $1', [pairKey]);
        const current = existing.rows[0]?.id;
        if (current) return current;
        const inserted = await client.query(
          `INSERT INTO rooms (id, kind, name, pair_key, created_at) VALUES ($1, 'private', NULL, $2, $3)
           ON CONFLICT (pair_key) WHERE pair_key IS NOT NULL DO NOTHING`, [id, pairKey, at],
        );
        if (!inserted.rowCount) {
          const again = await client.query<{ id: string }>('SELECT id FROM rooms WHERE pair_key = $1', [pairKey]);
          return again.rows[0]?.id ?? 'invalid';
        }
        await client.query(
          `INSERT INTO room_members (room_id, user_id) VALUES ($1, $2), ($1, $3) ON CONFLICT DO NOTHING`,
          [id, creatorId, others[0]],
        );
        return id;
      }
      if (others.length < 2 || others.length > 20 || !name) return 'invalid';
      const holder = ids[randomInt(ids.length)] ?? creatorId;
      await client.query(
        `INSERT INTO rooms (id, kind, name, created_at, admin_id, turn_user_id, turn_opens_at, turn_round)
         VALUES ($1, 'group', $2, $3, $4, $5, $3, 1)`,
        [id, name, at, creatorId, holder],
      );
      await client.query(
        `INSERT INTO room_members (room_id, user_id)
         SELECT $1, member_id FROM unnest($2::uuid[]) AS member_id
         ON CONFLICT DO NOTHING`,
        [id, ids],
      );
      return id;
        })();
        await client.query(result === 'invalid' ? 'ROLLBACK' : 'COMMIT');
        return result;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async listSaved(userId, limit, beforeId) {
      const result = await pool.query<{
        message_id: string;
        room_id: string;
        conversation_name: string;
        sender_id: string;
        sender_name: string;
        body: string;
        created_at: Date;
        saved_at: Date;
      }>(
        `SELECT s.message_id, m.room_id, m.sender_id, u.display_name AS sender_name,
                CASE
                  WHEN EXISTS (SELECT 1 FROM message_files f WHERE f.message_id = m.id)
                    THEN (SELECT f.name FROM message_files f WHERE f.message_id = m.id)
                  WHEN EXISTS (SELECT 1 FROM message_images i WHERE i.message_id = m.id) AND btrim(m.body) = '' THEN 'صورة'
                  ELSE m.body
                END AS body,
                m.created_at, s.saved_at,
                CASE
                  WHEN r.kind = 'private' THEN COALESCE((
                    SELECT ou.display_name FROM room_members om
                    JOIN users ou ON ou.id = om.user_id
                    WHERE om.room_id = r.id AND om.user_id <> $1
                    LIMIT 1
                  ), 'محادثة خاصة')
                  ELSE COALESCE(r.name, 'ChatX')
                END AS conversation_name
         FROM saved_messages s
         JOIN room_messages m ON m.id = s.message_id AND NOT m.deleted
         JOIN rooms r ON r.id = m.room_id
         JOIN room_members me ON me.room_id = r.id AND me.user_id = s.user_id
         JOIN users u ON u.id = m.sender_id
         WHERE s.user_id = $1
           AND ($3::uuid IS NULL OR (s.saved_at, s.message_id) <
             (SELECT c.saved_at, c.message_id FROM saved_messages c WHERE c.user_id = $1 AND c.message_id = $3))
         ORDER BY s.saved_at DESC, s.message_id DESC
         LIMIT $2`,
        [userId, limit, beforeId ?? null],
      );
      return result.rows.map((row): SavedItem => ({
        messageId: row.message_id,
        roomId: row.room_id,
        conversationName: row.conversation_name,
        senderId: row.sender_id,
        senderName: row.sender_name,
        text: row.body,
        createdAt: row.created_at,
        savedAt: row.saved_at,
      }));
    },
    async setSaved(userId, messageId, keep, at) {
      const row = await pool.query(
        `SELECT 1 FROM room_messages m
         JOIN room_members rm ON rm.room_id = m.room_id AND rm.user_id = $2
         WHERE m.id = $1 AND NOT m.deleted`,
        [messageId, userId],
      );
      if ((row.rowCount ?? 0) === 0) return 'missing';
      if (keep) {
        await pool.query(
          `INSERT INTO saved_messages (user_id, message_id, saved_at) VALUES ($1, $2, $3)
           ON CONFLICT (user_id, message_id) DO NOTHING`,
          [userId, messageId, at],
        );
      } else {
        await pool.query('DELETE FROM saved_messages WHERE user_id = $1 AND message_id = $2', [userId, messageId]);
      }
      return 'ok';
    },
    async listReaders(roomId) {
      const result = await pool.query<{ user_id: string; last_read_message_id: string; last_read_at: Date }>(
        `SELECT user_id, last_read_message_id, last_read_at
         FROM room_members
         WHERE room_id = $1 AND last_read_message_id IS NOT NULL AND last_read_at IS NOT NULL`,
        [roomId],
      );
      return result.rows.map((row) => ({
        userId: row.user_id,
        messageId: row.last_read_message_id,
        readAt: row.last_read_at,
      }));
    },
    async listPresence(now) {
      const result = await pool.query<{ id: string; presence: 'online' | 'away' | null; last_seen_at: Date | null }>(
        `SELECT u.id, s.presence, s.last_seen_at
         FROM users u
         LEFT JOIN LATERAL (
           SELECT presence, last_seen_at
           FROM sessions
           WHERE user_id = u.id AND expires_at > $1 AND last_seen_at IS NOT NULL
           ORDER BY last_seen_at DESC
           LIMIT 1
         ) s ON true
         WHERE u.role = 'member'`,
        [now],
      );
      return result.rows.map((row) => ({
        id: row.id,
        presence: row.presence,
        lastSeenAt: row.last_seen_at,
      }));
    },
  };
}
