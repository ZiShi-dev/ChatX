import { adminFetch, AdminApiError } from './adminApi';
import { useNetworkStore } from '../stores/networkStore';

function readProgress(payload: unknown, size: number): { offset: number; completed: boolean } {
  const row = payload as { offset?: unknown; completed?: unknown } | null;
  if (!row || typeof row.offset !== 'number' || !Number.isInteger(row.offset) || row.offset < 0 || row.offset > size || typeof row.completed !== 'boolean') throw new AdminApiError('invalid_upload', 400);
  return { offset: row.offset, completed: row.completed };
}
export async function uploadResumable(input: { roomId: string; id: string; kind: 'file' | 'image'; name: string; bytes: Uint8Array; replyToId?: string; sealed?: string }, progress: (percent: number) => void, yieldToTexts: () => Promise<void> = async () => undefined, cancelled: () => boolean = () => false) {
  const sha = await crypto.subtle.digest('SHA-256', new Uint8Array(input.bytes).buffer);
  const sha256 = [...new Uint8Array(sha)].map((value) => value.toString(16).padStart(2, '0')).join('');
  const path = `/api/rooms/${input.roomId}/uploads/${input.id}`;
  let state = readProgress(await adminFetch(path, { method: 'POST', body: { kind: input.kind, name: input.sealed ? 'file.bin' : input.name, size: input.bytes.length, sha256, replyToId: input.replyToId, ...(input.sealed ? { sealed: input.sealed } : {}) } }), input.bytes.length);
  if (state.completed) return;
  while (state.offset < input.bytes.length) {
    if (cancelled()) throw new AdminApiError('cancelled', 499);
    await yieldToTexts();
    const end = Math.min(input.bytes.length, state.offset + (useNetworkStore.getState().network === 'slow' ? 8192 : 32768));
    const next = readProgress(await adminFetch(`${path}?offset=${state.offset}`, { method: 'PATCH', binary: input.bytes.slice(state.offset, end) }), input.bytes.length);
    if (next.offset !== end) throw new AdminApiError('invalid_upload', 400);
    state = next; progress(Math.floor(100 * state.offset / input.bytes.length));
  }
  if (cancelled()) throw new AdminApiError('cancelled', 499);
  const confirmation = readProgress(await adminFetch(`${path}/complete`, { method: 'POST', body: {} }), input.bytes.length);
  if (!confirmation.completed) throw new AdminApiError('invalid_upload', 400);
}
