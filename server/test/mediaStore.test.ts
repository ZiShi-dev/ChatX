import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import pg from 'pg';
import { createMediaStore, isDiskMediaExpired, MEDIA_PURGE_INTERVAL_MS, mediaRetentionMs, migrateLegacyMedia, purgeExpiredMedia, purgeOrphanMedia } from '../src/mediaStore.ts';
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
  it('deletes disk images, files and videos only after 24 hours, on the daily sweep', () => {
    const day = 24 * 60 * 60 * 1000;
    assert.equal(mediaRetentionMs({}), day);
    assert.equal(MEDIA_PURGE_INTERVAL_MS, day);
    const now = Date.parse('2026-10-11T12:00:00Z');
    const kept = now - day;
    const due = kept - 1;
    for (const kind of ['image', 'file', 'video']) {
      assert.equal(isDiskMediaExpired(kept, now, day), false, kind);
      assert.equal(isDiskMediaExpired(due, now, day), true, kind);
      assert.equal(isDiskMediaExpired(now - 60_000, now, day), false, kind);
    }
  });

  it('creates images and files directories on ensure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'chatx-media-'));
    const store = createMediaStore(root);
    await store.ensure();
    const { stat } = await import('node:fs/promises');
    assert.equal((await stat(join(root, 'images'))).isDirectory(), true);
    assert.equal((await stat(join(root, 'files'))).isDirectory(), true);
  });

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
      const fileId = randomUUID();
      const videoId = randomUUID();
      const freshId = randomUUID();
      const freshAt = new Date('2026-01-01T12:00:00Z');
      for (const [id, at] of [[fileId, createdAt], [videoId, createdAt], [freshId, freshAt]] as const) {
        await pool.query(
          `INSERT INTO room_messages (id, room_id, sender_id, body, created_at) VALUES ($1, $2, $3, '', $4)`,
          [id, roomId, person.id, at],
        );
      }
      await pool.query(
        'INSERT INTO message_files (message_id, name, bytes, byte_size, stored_at) VALUES ($1, $2, NULL, $3, $4), ($5, $6, NULL, $3, $4), ($7, $8, NULL, $3, $9)',
        [fileId, 'notes.pdf', 4, createdAt, videoId, 'video.bin', freshId, 'clip.mp4', freshAt],
      );
      await store.put('file', fileId, Buffer.from('file'));
      await store.put('file', videoId, Buffer.from('vide'));
      await store.put('file', freshId, Buffer.from('new!'));
      await purgeExpiredMedia(pool, store, new Date('2026-01-02T00:00:00Z'));
      assert.equal((await pool.query('SELECT 1 FROM message_images WHERE message_id = $1', [messageId])).rowCount, 0);
      assert.equal(await store.get('image', messageId), null);
      assert.equal((await pool.query('SELECT 1 FROM message_files WHERE message_id = $1', [fileId])).rowCount, 0);
      assert.equal(await store.get('file', fileId), null);
      assert.equal((await pool.query('SELECT 1 FROM message_files WHERE message_id = $1', [videoId])).rowCount, 0);
      assert.equal(await store.get('file', videoId), null);
      assert.equal((await pool.query('SELECT 1 FROM message_files WHERE message_id = $1', [freshId])).rowCount, 1);
      assert.equal((await store.get('file', freshId))?.toString(), 'new!');
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
