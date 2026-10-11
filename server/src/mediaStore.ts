import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';

export type MediaKind = 'image' | 'file';

const MESSAGE_ID = /^[0-9a-f-]{36}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

export function mediaRetentionMs(env: NodeJS.ProcessEnv = process.env) {
  const raw = Number(env.CHATX_MEDIA_RETENTION_MS ?? String(DAY_MS));
  return Number.isInteger(raw) && raw >= 60_000 ? raw : DAY_MS;
}

export function createMediaStore(root: string) {
  const pathFor = (kind: MediaKind, messageId: string) => join(root, kind === 'image' ? 'images' : 'files', `${messageId}.bin`);

  async function ensure() {
    await mkdir(join(root, 'images'), { recursive: true });
    await mkdir(join(root, 'files'), { recursive: true });
  }

  async function put(kind: MediaKind, messageId: string, bytes: Uint8Array | Buffer) {
    if (!MESSAGE_ID.test(messageId)) throw new Error('invalid_message_id');
    await ensure();
    await writeFile(pathFor(kind, messageId), Buffer.from(bytes));
  }

  async function get(kind: MediaKind, messageId: string): Promise<Buffer | null> {
    if (!MESSAGE_ID.test(messageId)) return null;
    try {
      return await readFile(pathFor(kind, messageId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async function remove(kind: MediaKind, messageId: string) {
    if (!MESSAGE_ID.test(messageId)) return;
    try {
      await unlink(pathFor(kind, messageId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  async function removeMessage(messageId: string) {
    await remove('image', messageId);
    await remove('file', messageId);
  }

  async function listIds(kind: MediaKind) {
    await ensure();
    const names = await readdir(join(root, kind === 'image' ? 'images' : 'files'));
    return names
      .filter((name) => name.endsWith('.bin'))
      .map((name) => name.slice(0, -4))
      .filter((id) => MESSAGE_ID.test(id));
  }

  return { root, ensure, put, get, remove, removeMessage, listIds };
}

export type MediaStore = ReturnType<typeof createMediaStore>;

export async function migrateLegacyMedia(pool: pg.Pool, store: MediaStore) {
  const images = await pool.query<{ message_id: string; bytes: Buffer; created_at: Date }>(
    `SELECT i.message_id, i.bytes, m.created_at
     FROM message_images i
     JOIN room_messages m ON m.id = i.message_id
     WHERE i.bytes IS NOT NULL`,
  );
  for (const row of images.rows) {
    if (!Buffer.isBuffer(row.bytes) || !row.bytes.length) continue;
    await store.put('image', row.message_id, row.bytes);
    await pool.query(
      'UPDATE message_images SET bytes = NULL, byte_size = $2, stored_at = $3 WHERE message_id = $1',
      [row.message_id, row.bytes.length, row.created_at],
    );
  }
  const files = await pool.query<{ message_id: string; bytes: Buffer; created_at: Date }>(
    `SELECT f.message_id, f.bytes, m.created_at
     FROM message_files f
     JOIN room_messages m ON m.id = f.message_id
     WHERE f.bytes IS NOT NULL`,
  );
  for (const row of files.rows) {
    if (!Buffer.isBuffer(row.bytes) || !row.bytes.length) continue;
    await store.put('file', row.message_id, row.bytes);
    await pool.query(
      'UPDATE message_files SET bytes = NULL, byte_size = $2, stored_at = $3 WHERE message_id = $1',
      [row.message_id, row.bytes.length, row.created_at],
    );
  }
}

export type MediaPurgeCounts = { images: number; files: number; orphans: number };

export type MediaOpsStatus = {
  lastRunAt: string | null;
  lastError: string | null;
  lastExpiredImages: number;
  lastExpiredFiles: number;
  lastOrphans: number;
};

let mediaOps: MediaOpsStatus = {
  lastRunAt: null,
  lastError: null,
  lastExpiredImages: 0,
  lastExpiredFiles: 0,
  lastOrphans: 0,
};

export function readMediaOpsStatus(): MediaOpsStatus {
  return mediaOps;
}

export async function purgeExpiredMedia(pool: pg.Pool, store: MediaStore, before: Date) {
  let images = 0;
  let files = 0;
  const imageRows = await pool.query<{ message_id: string }>(
    'SELECT message_id FROM message_images WHERE stored_at IS NOT NULL AND stored_at < $1',
    [before],
  );
  for (const row of imageRows.rows) {
    await store.remove('image', row.message_id);
    await pool.query('DELETE FROM message_images WHERE message_id = $1', [row.message_id]);
    images += 1;
  }
  const fileRows = await pool.query<{ message_id: string }>(
    'SELECT message_id FROM message_files WHERE stored_at IS NOT NULL AND stored_at < $1',
    [before],
  );
  for (const row of fileRows.rows) {
    await store.remove('file', row.message_id);
    await pool.query('DELETE FROM message_files WHERE message_id = $1', [row.message_id]);
    files += 1;
  }
  return { images, files };
}

export async function purgeOrphanMedia(pool: pg.Pool, store: MediaStore) {
  const kept = await pool.query<{ message_id: string; kind: string }>(
    `SELECT message_id, 'image' AS kind FROM message_images
     UNION ALL
     SELECT message_id, 'file' AS kind FROM message_files`,
  );
  const live = new Set(kept.rows.map((row) => `${row.kind}:${row.message_id}`));
  let orphans = 0;
  for (const kind of ['image', 'file'] as MediaKind[]) {
    for (const messageId of await store.listIds(kind)) {
      if (!live.has(`${kind}:${messageId}`)) {
        await store.remove(kind, messageId);
        orphans += 1;
      }
    }
  }
  return orphans;
}

async function folderFootprint(store: MediaStore, kind: MediaKind) {
  let bytes = 0;
  for (const messageId of await store.listIds(kind)) {
    try {
      bytes += (await stat(join(store.root, kind === 'image' ? 'images' : 'files', `${messageId}.bin`))).size;
    } catch { /* missing file is reported elsewhere */ }
  }
  return { count: (await store.listIds(kind)).length, bytes };
}

export type OwnerMediaStatus = {
  mediaRetentionMs: number;
  diskImageFiles: number;
  diskFileFiles: number;
  diskBytes: number;
  metadataImages: number;
  metadataFiles: number;
  legacyImageRows: number;
  legacyFileRows: number;
  lastPurgeAt: string | null;
  lastPurgeError: string | null;
  lastExpiredImages: number;
  lastExpiredFiles: number;
  lastOrphans: number;
};

export async function collectOwnerMediaStatus(pool: pg.Pool, store: MediaStore, retentionMs: number): Promise<OwnerMediaStatus> {
  const images = await folderFootprint(store, 'image');
  const files = await folderFootprint(store, 'file');
  const meta = await pool.query<{ images: number; files: number; legacy_images: number; legacy_files: number }>(
    `SELECT
      (SELECT count(*)::int FROM message_images) AS images,
      (SELECT count(*)::int FROM message_files) AS files,
      (SELECT count(*)::int FROM message_images WHERE bytes IS NOT NULL) AS legacy_images,
      (SELECT count(*)::int FROM message_files WHERE bytes IS NOT NULL) AS legacy_files`,
  );
  const row = meta.rows[0];
  const ops = readMediaOpsStatus();
  return {
    mediaRetentionMs: retentionMs,
    diskImageFiles: images.count,
    diskFileFiles: files.count,
    diskBytes: images.bytes + files.bytes,
    metadataImages: row?.images ?? 0,
    metadataFiles: row?.files ?? 0,
    legacyImageRows: row?.legacy_images ?? 0,
    legacyFileRows: row?.legacy_files ?? 0,
    lastPurgeAt: ops.lastRunAt,
    lastPurgeError: ops.lastError,
    lastExpiredImages: ops.lastExpiredImages,
    lastExpiredFiles: ops.lastExpiredFiles,
    lastOrphans: ops.lastOrphans,
  };
}

export function startMediaPurgeScheduler(pool: pg.Pool, store: MediaStore, retentionMs: number, log: (message: string) => void = () => undefined) {
  const tick = async () => {
    try {
      const before = new Date(Date.now() - retentionMs);
      const expired = await purgeExpiredMedia(pool, store, before);
      const orphans = await purgeOrphanMedia(pool, store);
      mediaOps = {
        lastRunAt: new Date().toISOString(),
        lastError: null,
        lastExpiredImages: expired.images,
        lastExpiredFiles: expired.files,
        lastOrphans: orphans,
      };
      log('media purge complete');
    } catch (error) {
      mediaOps = {
        ...mediaOps,
        lastRunAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.message : 'media purge failed',
      };
      throw error;
    }
  };
  void tick().catch((error) => log(error instanceof Error ? error.message : 'media purge failed'));
  return setInterval(() => {
    void tick().catch((error) => log(error instanceof Error ? error.message : 'media purge failed'));
  }, DAY_MS);
}
