import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import pg from 'pg';
import { createMediaStore, migrateLegacyMedia, purgeExpiredMedia, purgeOrphanMedia } from '../src/mediaStore.ts';
import { createPostgresRepository } from '../src/postgres.ts';
import { migrate } from '../src/migrate.ts';
import type { AuthUser } from '../src/types.ts';

const member = (id: string): AuthUser => ({
  id,
  email: `${id}@example.invalid`,
  displayName: 'tester',
  username: 'tester',
  role: 'member',
  bio: '',
  bannerUrl: null,
  avatarUrl: null,
});

describe('media store', () => {
  it('writes and reads message blobs on disk', async () => {
    const root = await mkdtemp(join(tmpdir(), 'chatx-media-'));
    const store = createMediaStore(root);
    const messageId = randomUUID();
    const bytes = Buffer.from([255, 216, 255, 0, 1]);
    await store.put('image', messageId, bytes);
    assert.deepEqual([...(await store.get('image', messageId))!], [...bytes]);
    await store.remove('image', messageId);
    assert.equal(await store.get('image', messageId), null);
  });

  it('migrates legacy bytea rows to disk and purges by age', { skip: !process.env.CHATX_TEST_DATABASE_URL }, async () => {
    const database = process.env.CHATX_TEST_DATABASE_URL!;
    const schema = `chatx_media_${randomUUID().replaceAll('-', '')}`;
    const admin = new pg.Pool({ connectionString: database });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new pg.Pool({ connectionString: database, options: `-c search_path=${schema}` });
    const root = await mkdtemp(join(tmpdir(), 'chatx-media-'));
    const store = createMediaStore(root);
    try {
      await migrate(pool);
      const repo = createPostgresRepository(pool, store);
      const person = member(randomUUID());
      await repo.insertUser(person);
      await repo.ensureHome(person.id);
      const rooms = await repo.listHome(person.id);
      const roomId = rooms[0]!.id;
      const messageId = randomUUID();
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const image = new Uint8Array([255, 216, 255, 0, 2]);
      await pool.query(
        `INSERT INTO room_messages (id, room_id, sender_id, body, created_at) VALUES ($1, $2, $3, '', $4)`,
        [messageId, roomId, person.id, createdAt],
      );
      await pool.query('INSERT INTO message_images (message_id, bytes) VALUES ($1, $2)', [messageId, Buffer.from(image)]);
      await migrateLegacyMedia(pool, store);
      const legacy = await pool.query('SELECT bytes, byte_size, stored_at FROM message_images WHERE message_id = $1', [messageId]);
      assert.equal(legacy.rows[0].bytes, null);
      assert.equal(legacy.rows[0].byte_size, image.length);
      assert.deepEqual([...(await store.get('image', messageId))!], [...image]);
      await purgeExpiredMedia(pool, store, new Date('2026-01-02T00:00:00Z'));
      assert.equal((await pool.query('SELECT 1 FROM message_images WHERE message_id = $1', [messageId])).rowCount, 0);
      assert.equal(await store.get('image', messageId), null);
      await store.put('file', messageId, Buffer.from('orphan'));
      await purgeOrphanMedia(pool, store);
      assert.equal(await store.get('file', messageId), null);
    } finally {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  });
});
