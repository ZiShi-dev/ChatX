import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ERASE_OPERATOR_EMAIL, eraseGroupSelection, eraseMember, eraseSelection, resolveEraseChoices, type Queryable } from '../src/eraseMember.ts';
import { GLOBAL_ROOM_ID } from '../src/home.ts';

function scripted(rows: Array<{ id: string; email: string; google_sub?: string } | null>): Queryable & { sql: string[] } {
  const sql: string[] = [];
  let read = 0;
  return {
    sql,
    async query(text) {
      sql.push(text);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK' || text.startsWith('UPDATE') || text.startsWith('INSERT') || text.startsWith('DELETE FROM rooms') || text.startsWith('DELETE FROM room_messages')) {
        return { rows: [], rowCount: 1 };
      }
      if (text.startsWith('DELETE FROM users')) return { rows: [], rowCount: 1 };
      const row = rows[read] ?? null;
      read += 1;
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    },
  };
}

describe('eraseMember', () => {
  it('refuses when the Google operator account is absent', async () => {
    const db = scripted([null]);
    assert.deepEqual(await eraseMember(db, 'other@example.com'), { ok: false, error: 'forbidden' });
    assert.equal(db.sql.some((item) => item === 'BEGIN'), false);
  });

  it('refuses to erase the operator account', async () => {
    const db = scripted([
      { id: 'owner', email: ERASE_OPERATOR_EMAIL, google_sub: 'sub' },
      { id: 'owner', email: ERASE_OPERATOR_EMAIL },
    ]);
    assert.deepEqual(await eraseMember(db, ERASE_OPERATOR_EMAIL), { ok: false, error: 'forbidden' });
  });

  it('erases another account and the rows tied to it', async () => {
    const db = scripted([
      { id: 'owner', email: ERASE_OPERATOR_EMAIL, google_sub: 'sub' },
      { id: 'member', email: 'amina@example.com' },
    ]);
    assert.deepEqual(await eraseMember(db, 'Amina@example.com'), { ok: true, id: 'member', email: 'amina@example.com' });
    assert.ok(db.sql.some((item) => item.includes("kind = 'private'")));
    assert.ok(db.sql.some((item) => item.startsWith('DELETE FROM room_messages')));
    assert.ok(db.sql.some((item) => item.startsWith('DELETE FROM users')));
    assert.equal(db.sql.at(-1), 'COMMIT');
  });

  it('keeps an empty selection from touching the database', () => {
    assert.equal(resolveEraseChoices({ messages: false }), null);
    assert.equal(resolveEraseChoices({ messages: 'yes' }), null);
  });

  it('forces authored content when the account itself is removed', () => {
    const choices = resolveEraseChoices({ account: true, privateChats: false });
    assert.equal(choices?.messages, true);
    assert.equal(choices?.images, true);
    assert.equal(choices?.files, true);
    assert.equal(choices?.privateChats, false);
  });

  it('deletes only the selected rows and refuses the operator', async () => {
    const target = '22222222-2222-4222-8222-222222222222';
    const actor = '11111111-1111-4111-8111-111111111111';
    const owner = { id: actor, email: ERASE_OPERATOR_EMAIL, google_sub: 'sub' };
    const selected = scripted([owner, { id: target, email: 'amina@example.com' }]);
    assert.deepEqual(await eraseSelection(selected, actor, target, { messages: true }), { ok: true, id: target });
    assert.ok(selected.sql.some((item) => item.includes('NOT EXISTS')));
    assert.ok(selected.sql.some((item) => item.includes('owner_audit')));
    assert.equal(selected.sql.some((item) => item.startsWith('DELETE FROM users')), false);
    assert.equal(selected.sql.at(-1), 'COMMIT');

    const account = scripted([owner, { id: target, email: 'amina@example.com' }]);
    assert.equal((await eraseSelection(account, actor, target, { account: true })).ok, true);
    assert.ok(account.sql.some((item) => item.startsWith('DELETE FROM users')));
    assert.equal(account.sql.some((item) => item.includes("kind = 'private'")), false);

    const unbound = scripted([{ id: actor, email: ERASE_OPERATOR_EMAIL }]);
    assert.deepEqual(await eraseSelection(unbound, actor, target, { account: true }), { ok: false, error: 'forbidden' });
    assert.equal(unbound.sql.some((item) => item.startsWith('DELETE')), false);

    const operator = scripted([
      { id: '33333333-3333-4333-8333-333333333333', email: ERASE_OPERATOR_EMAIL, google_sub: 'sub' },
      { id: actor, email: ERASE_OPERATOR_EMAIL },
    ]);
    assert.deepEqual(await eraseSelection(operator, '33333333-3333-4333-8333-333333333333', actor, { account: true }), { ok: false, error: 'forbidden' });
    assert.equal(operator.sql.at(-1), 'ROLLBACK');
    assert.equal(operator.sql.some((item) => item.startsWith('DELETE')), false);
  });

  it('deletes a group and refuses the main ChatX room', async () => {
    const actorId = '11111111-1111-4111-8111-111111111111';
    const groupId = '66666666-6666-4666-8666-666666666666';
    const room = (kind: string | null): Queryable & { sql: string[] } => {
      const sql: string[] = [];
      let selects = 0;
      return {
        sql,
        async query(text) {
          sql.push(text);
          if (text.startsWith('SELECT')) {
            selects += 1;
            if (selects === 1) return { rows: [{ id: actorId, email: ERASE_OPERATOR_EMAIL, google_sub: 'sub' }], rowCount: 1 };
            return { rows: kind ? [{ id: groupId, kind }] : [], rowCount: kind ? 1 : 0 };
          }
          return { rows: [], rowCount: 1 };
        },
      };
    };
    const removed = room('group');
    assert.equal((await eraseGroupSelection(removed, actorId, groupId, { group: true })).ok, true);
    assert.ok(removed.sql.some((item) => item.startsWith('DELETE FROM rooms')));
    assert.ok(removed.sql.some((item) => item.includes('owner_audit')));
    const messages = room('group');
    assert.equal((await eraseGroupSelection(messages, actorId, groupId, { messages: true })).ok, true);
    assert.equal(messages.sql.some((item) => item.startsWith('DELETE FROM rooms')), false);
    const main = room('global');
    assert.deepEqual(await eraseGroupSelection(main, actorId, GLOBAL_ROOM_ID, { group: true }), { ok: false, error: 'forbidden' });
    assert.equal(main.sql.some((item) => item === 'BEGIN'), false);
    const chat = room('private');
    assert.deepEqual(await eraseGroupSelection(chat, actorId, groupId, { group: true }), { ok: false, error: 'forbidden' });
    assert.equal(chat.sql.at(-1), 'ROLLBACK');
    assert.equal(chat.sql.some((item) => item.startsWith('DELETE')), false);
  });
});
