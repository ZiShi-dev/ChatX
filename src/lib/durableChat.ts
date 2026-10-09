import type { Message } from '../types/message';

let database: Promise<IDBDatabase> | undefined;
function open() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('storage_unavailable')); return; }
    const request = indexedDB.open('chatx-durable-v1', 2);
    request.onupgradeneeded = () => {
      const outgoing = request.result.objectStoreNames.contains('outgoing') ? request.transaction!.objectStore('outgoing') : request.result.createObjectStore('outgoing', { keyPath: 'key' });
      if (!outgoing.indexNames.contains('owner')) outgoing.createIndex('owner', 'owner');
      if (!request.result.objectStoreNames.contains('media')) request.result.createObjectStore('media', { keyPath: 'key' });
    };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = undefined; }; resolve(request.result); };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error('storage_blocked')); };
  });
  return database;
}

async function transaction<T>(store: 'outgoing' | 'media', mode: IDBTransactionMode, operation: (table: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = operation(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('storage_failed'));
  });
}

export async function saveOutgoing(owner: string, message: Message) {
  // A completed transaction, not a successful put request, is the durability boundary.
  await transaction('outgoing', 'readwrite', (table) => table.put({ key: `${owner}:${message.id}`, owner, message: { ...message, status: message.status === 'sending' ? 'pending' : message.status } }));
}
export async function removeOutgoing(owner: string, id: string) {
  await transaction('outgoing', 'readwrite', (table) => table.delete(`${owner}:${id}`));
}
export async function loadOutgoing(owner: string): Promise<Message[]> {
  const rows = await transaction('outgoing', 'readonly', (table) => table.index('owner').getAll(owner)) as Array<{ owner: string; message: Message }>;
  return rows.filter((row) => row.owner === owner && row.message.senderId === owner && row.message.status !== 'sent').map((row) => row.message);
}

const MEDIA_BYTES = 8 * 1024 * 1024;
export async function saveReceivedMedia(owner: string, id: string, blob: Blob) {
  if (blob.size > MEDIA_BYTES) return;
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('media', 'readwrite');
    const table = tx.objectStore('media');
    table.put({ key: `${owner}:${id}`, owner, id, blob, at: Date.now() });
    const request = table.getAll();
    request.onsuccess = () => {
      const rows = (request.result as Array<{ key: string; blob: Blob; at: number }>).sort((a, b) => b.at - a.at);
      let total = 0;
      for (const row of rows) { total += row.blob.size; if (total > MEDIA_BYTES) table.delete(row.key); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('storage_failed'));
  });
}
export async function readReceivedMedia(owner: string, id: string): Promise<Blob | null> {
  const row = await transaction('media', 'readonly', (table) => table.get(`${owner}:${id}`)) as { blob: Blob } | undefined;
  if (!row) return null;
  await saveReceivedMedia(owner, id, row.blob);
  return row.blob;
}
export async function clearReceivedMedia(owner: string) {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('media', 'readwrite'); const table = tx.objectStore('media'); const request = table.openCursor();
    request.onsuccess = () => { const cursor = request.result; if (cursor) { if (cursor.value.owner === owner) cursor.delete(); cursor.continue(); } };
    tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
