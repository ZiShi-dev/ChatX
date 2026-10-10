import { randomUUID } from 'node:crypto';
import { GLOBAL_ROOM_ID } from './home.ts';
import type { EraseChoices, GroupEraseChoices } from './types.ts';

export const ERASE_OPERATOR_EMAIL = 'ibrahim.vignes@gmail.com';

const CHOICE_KEYS = ['messages', 'images', 'files', 'reactions', 'privateChats', 'profile', 'membership', 'account'] as const;
const GROUP_KEYS = ['messages', 'images', 'files', 'reactions', 'group'] as const;

export function auditDetail(choices: Record<string, boolean>) {
  return Object.keys(choices).filter((key) => choices[key] === true).join(',').slice(0, 200);
}

function boundOperator(row: { id?: string; email?: string; google_sub?: string | null } | undefined): row is { id: string; email: string; google_sub: string } {
  return Boolean(row?.id && row.email === ERASE_OPERATOR_EMAIL && row.google_sub);
}

export function resolveEraseChoices(input: unknown): EraseChoices | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const choices = {} as EraseChoices;
  for (const key of CHOICE_KEYS) {
    const value = source[key];
    if (value !== undefined && typeof value !== 'boolean') return null;
    choices[key] = value === true;
  }
  if (choices.account) {
    choices.messages = true;
    choices.images = true;
    choices.files = true;
    choices.reactions = true;
    choices.profile = true;
    choices.membership = true;
  }
  return CHOICE_KEYS.some((key) => choices[key]) ? choices : null;
}

export function resolveGroupChoices(input: unknown): GroupEraseChoices | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const choices = {} as GroupEraseChoices;
  for (const key of GROUP_KEYS) {
    const value = source[key];
    if (value !== undefined && typeof value !== 'boolean') return null;
    choices[key] = value === true;
  }
  if (choices.group) {
    choices.messages = true;
    choices.images = true;
    choices.files = true;
    choices.reactions = true;
  }
  return GROUP_KEYS.some((key) => choices[key]) ? choices : null;
}

export async function eraseGroupSelection(db: Queryable, actorId: string, roomId: string, input: unknown) {
  const choices = resolveGroupChoices(input);
  if (!choices || !UUID.test(actorId) || !UUID.test(roomId) || roomId === GLOBAL_ROOM_ID) {
    return { ok: false as const, error: choices && roomId === GLOBAL_ROOM_ID ? 'forbidden' as const : 'missing' as const };
  }

  await db.query('BEGIN');
  try {
    const actor = await db.query('SELECT id, lower(email) AS email, google_sub FROM users WHERE id = $1::uuid FOR UPDATE', [actorId]);
    const owner = actor.rows[0];
    if (!boundOperator(owner)) {
      await db.query('ROLLBACK');
      return { ok: false as const, error: 'forbidden' as const };
    }
    const found = await db.query('SELECT id, kind FROM rooms WHERE id = $1::uuid FOR UPDATE', [roomId]);
    const room = found.rows[0];
    if (!room?.id || !room.kind) {
      await db.query('ROLLBACK');
      return { ok: false as const, error: 'missing' as const };
    }
    if (room.kind !== 'group') {
      await db.query('ROLLBACK');
      return { ok: false as const, error: 'forbidden' as const };
    }
    if (choices.group) {
      const removed = await db.query(`DELETE FROM rooms WHERE id = $1 AND kind = 'group'`, [room.id]);
      if (!removed.rowCount) throw new Error('missing');
    } else {
      if (choices.images) {
        await db.query(
          `DELETE FROM room_messages
           WHERE room_id = $1
             AND id IN (SELECT message_id FROM message_images)`,
          [room.id],
        );
      }
      if (choices.files) {
        await db.query(
          `DELETE FROM room_messages
           WHERE room_id = $1
             AND id IN (SELECT message_id FROM message_files)`,
          [room.id],
        );
      }
      if (choices.messages) {
        await db.query(
          `DELETE FROM room_messages AS m
           WHERE m.room_id = $1
             AND NOT EXISTS (SELECT 1 FROM message_images AS i WHERE i.message_id = m.id)
             AND NOT EXISTS (SELECT 1 FROM message_files AS f WHERE f.message_id = m.id)`,
          [room.id],
        );
      }
      if (choices.reactions) {
        await db.query(
          `DELETE FROM message_reactions
           WHERE message_id IN (SELECT id FROM room_messages WHERE room_id = $1)`,
          [room.id],
        );
      }
    }
    await db.query(
      `INSERT INTO owner_audit (id, actor_id, action, target_id, detail) VALUES ($1, $2, 'group', $3, $4)`,
      [randomUUID(), owner.id, room.id, auditDetail(choices)],
    );
    await db.query('COMMIT');
    return { ok: true as const, id: room.id };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

export async function eraseSelection(db: Queryable, actorId: string, targetId: string, input: unknown) {
  if (actorId === targetId) return { ok: false as const, error: 'forbidden' as const };
  const choices = resolveEraseChoices(input);
  if (!choices || !UUID.test(actorId) || !UUID.test(targetId)) return { ok: false as const, error: 'missing' as const };

  await db.query('BEGIN');
  try {
    const actor = await db.query('SELECT id, lower(email) AS email, google_sub FROM users WHERE id = $1::uuid FOR UPDATE', [actorId]);
    const owner = actor.rows[0];
    if (!boundOperator(owner)) {
      await db.query('ROLLBACK');
      return { ok: false as const, error: 'forbidden' as const };
    }
    const found = await db.query('SELECT id, lower(email) AS email FROM users WHERE id = $1::uuid FOR UPDATE', [targetId]);
    const person = found.rows[0];
    if (!person?.id || !person.email) {
      await db.query('ROLLBACK');
      return { ok: false as const, error: 'missing' as const };
    }
    if (person.email === ERASE_OPERATOR_EMAIL) {
      await db.query('ROLLBACK');
      return { ok: false as const, error: 'forbidden' as const };
    }
    if (choices.privateChats) {
      await db.query(
        `DELETE FROM rooms
         WHERE kind = 'private'
           AND id IN (SELECT room_id FROM room_members WHERE user_id = $1)`,
        [person.id],
      );
    }
    if (choices.images) {
      await db.query(
        `DELETE FROM room_messages
         WHERE sender_id = $1
           AND id IN (SELECT message_id FROM message_images)`,
        [person.id],
      );
    }
    if (choices.files) {
      await db.query(
        `DELETE FROM room_messages
         WHERE sender_id = $1
           AND id IN (SELECT message_id FROM message_files)`,
        [person.id],
      );
    }
    if (choices.messages) {
      await db.query(
        `DELETE FROM room_messages AS m
         WHERE m.sender_id = $1
           AND NOT EXISTS (SELECT 1 FROM message_images AS i WHERE i.message_id = m.id)
           AND NOT EXISTS (SELECT 1 FROM message_files AS f WHERE f.message_id = m.id)`,
        [person.id],
      );
    }
    if (choices.reactions) {
      await db.query('DELETE FROM message_reactions WHERE user_id = $1', [person.id]);
    }
    if (choices.profile && !choices.account) {
      await db.query("UPDATE users SET avatar = NULL, banner = NULL, avatar_decoration = 'none', profile_effect = 'none' WHERE id = $1", [person.id]);
    }
    if (choices.membership && !choices.account) {
      await db.query(
        `DELETE FROM room_members
         WHERE user_id = $1
           AND room_id IN (SELECT id FROM rooms WHERE kind = 'group')`,
        [person.id],
      );
    }
    if (choices.account) {
      await db.query(
        `UPDATE rooms SET admin_id = $2
         WHERE admin_id = $1
           AND EXISTS (SELECT 1 FROM room_members WHERE room_id = rooms.id AND user_id = $2)`,
        [person.id, actorId],
      );
      await db.query('UPDATE rooms SET admin_id = NULL WHERE admin_id = $1', [person.id]);
      await db.query('UPDATE rooms SET turn_user_id = NULL WHERE turn_user_id = $1', [person.id]);
      await db.query('UPDATE security_events SET user_id = NULL WHERE user_id = $1', [person.id]);
      await db.query('DELETE FROM room_messages WHERE sender_id = $1', [person.id]);
      const removed = await db.query('DELETE FROM users WHERE id = $1', [person.id]);
      if (!removed.rowCount) throw new Error('missing');
    }
    await db.query(
      `INSERT INTO owner_audit (id, actor_id, action, target_id, detail) VALUES ($1, $2, 'member', $3, $4)`,
      [randomUUID(), owner.id, person.id, auditDetail(choices)],
    );
    await db.query('COMMIT');
    return { ok: true as const, id: person.id };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

type QueryResult = { rows: Array<{ id?: string; email?: string; kind?: string; google_sub?: string | null }>; rowCount?: number | null };

export type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<QueryResult>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function eraseMember(db: Queryable, target: string) {
  const key = target.trim().toLowerCase();
  if (!key || key.length > 254) return { ok: false as const, error: 'missing' as const };
  const operator = await db.query('SELECT id, google_sub FROM users WHERE lower(email) = $1', [ERASE_OPERATOR_EMAIL]);
  const operatorId = operator.rows[0]?.id;
  if (!operatorId || !operator.rows[0]?.google_sub) return { ok: false as const, error: 'forbidden' as const };
  const found = await db.query(
    'SELECT id, lower(email) AS email FROM users WHERE lower(email) = $1 OR ($2::uuid IS NOT NULL AND id = $2::uuid)',
    [key, UUID.test(key) ? key : null],
  );
  const person = found.rows[0];
  if (!person?.id || !person.email) return { ok: false as const, error: 'missing' as const };
  if (person.id === operatorId || person.email === ERASE_OPERATOR_EMAIL) return { ok: false as const, error: 'forbidden' as const };

  await db.query('BEGIN');
  try {
    await db.query(
      `UPDATE rooms SET admin_id = $2
       WHERE admin_id = $1
         AND EXISTS (SELECT 1 FROM room_members WHERE room_id = rooms.id AND user_id = $2)`,
      [person.id, operatorId],
    );
    await db.query('UPDATE rooms SET admin_id = NULL WHERE admin_id = $1', [person.id]);
    await db.query('UPDATE rooms SET turn_user_id = NULL WHERE turn_user_id = $1', [person.id]);
    await db.query('UPDATE security_events SET user_id = NULL WHERE user_id = $1', [person.id]);
    await db.query(
      `DELETE FROM rooms
       WHERE kind = 'private'
         AND id IN (SELECT room_id FROM room_members WHERE user_id = $1)`,
      [person.id],
    );
    await db.query('DELETE FROM room_messages WHERE sender_id = $1', [person.id]);
    const removed = await db.query('DELETE FROM users WHERE id = $1', [person.id]);
    if (!removed.rowCount) throw new Error('missing');
    await db.query(
      `INSERT INTO owner_audit (id, actor_id, action, target_id, detail) VALUES ($1, $2, 'member', $3, 'account,messages,images,files,reactions,privateChats,profile,membership')`,
      [randomUUID(), operatorId, person.id],
    );
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
  return { ok: true as const, id: person.id, email: person.email };
}
