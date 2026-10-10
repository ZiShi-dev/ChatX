import { createHash } from 'node:crypto';
import type { Deps } from './authService.ts';
import { hashSession, readCookie } from './session.ts';
import { cleanFileName, messageView, postRoomMessage } from './home.ts';
import { cleanSealed, FILE_BYTES_MAX, IMAGE_BYTES_MAX, isVideoFileName, SEALED_FILE_NAME, SEALED_OVERHEAD, SEALED_VIDEO_NAME, VIDEO_BYTES_MAX } from './sealed.ts';

const ID = /^[0-9a-f-]{36}$/i;
const fail = (error: string, status: number) => ({ error, status });
export async function handleTransfer(deps: Deps, request: Request, roomId: string, id: string, complete: boolean) {
  const token = readCookie(request.headers.get('cookie'), 'chatx_session');
  const at = new Date(deps.now());
  const user = token ? await deps.repo.findSessionUser(hashSession(token), at) : null;
  if (!user || user.role !== 'member') return fail('invalid_credentials', 401);
  if (!ID.test(roomId) || !ID.test(id)) return fail('not_found', 404);
  const existing = await deps.repo.listRoomMessages(roomId, user.id, 1, { aroundId: id });
  if (existing === null) return fail('not_found', 404);
  const confirmed = existing.find((message) => message.id === id && message.senderId === user.id);
  if (confirmed) return { offset: confirmed.imageSize ?? confirmed.fileBytes ?? 0, completed: true, message: messageView(confirmed), status: 200 };
  if (request.method === 'POST' && !complete) {
    const raw = await request.text();
    if (raw.length > 4096) return fail('invalid_upload', 400);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); if (!body || typeof body !== 'object') throw new Error(); } catch { return fail('invalid_upload', 400); }
    const kind = body.kind; const size = body.size; const sha256 = body.sha256;
    const sealed = body.sealed == null ? null : cleanSealed(body.sealed);
    if (body.sealed != null && (!sealed || sealed.length > 1000)) return fail('invalid_upload', 400);
    const name = kind === 'image' ? 'photo.jpg' : kind === 'video' ? (sealed ? SEALED_VIDEO_NAME : cleanFileName(body.name)) : sealed ? SEALED_FILE_NAME : cleanFileName(body.name);
    const plainMax = kind === 'image' ? IMAGE_BYTES_MAX : kind === 'video' && sealed ? VIDEO_BYTES_MAX : FILE_BYTES_MAX;
    const max = plainMax + (sealed ? SEALED_OVERHEAD : 0);
    if ((kind !== 'image' && kind !== 'file' && kind !== 'video') || (kind === 'video' && !sealed && !isVideoFileName(name ?? '')) || !name || typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > max
      || typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) return fail('invalid_upload', 400);
    const replyToId = typeof body.replyToId === 'string' && ID.test(body.replyToId) && body.replyToId !== id ? body.replyToId : null;
    const upload = await deps.repo.beginUpload({ id, roomId, ownerId: user.id, kind, name, size, sha256, replyToId, bytes: new Uint8Array(), expiresAt: new Date(at.getTime() + 86_400_000), sealed }, at);
    return upload ? { offset: upload.bytes.length, completed: false, status: 200 } : fail('upload_conflict', 409);
  }
  const upload = await deps.repo.readUpload(roomId, user.id, id, at);
  if (!upload) return fail('not_found', 404);
  if (request.method === 'PATCH' && !complete) {
    const rawOffset = new URL(request.url).searchParams.get('offset'); const offset = Number(rawOffset);
    if (!rawOffset || !/^\d+$/.test(rawOffset) || !Number.isSafeInteger(offset)) return fail('invalid_upload', 400);
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length || bytes.length > 32_768 || !request.headers.get('content-type')?.startsWith('application/octet-stream')) return fail('invalid_upload', 400);
    const next = await deps.repo.appendUpload(roomId, user.id, id, offset, bytes, at);
    return next ? { offset: next.bytes.length, completed: false, status: 200 } : fail('offset_mismatch', 409);
  }
  if (request.method === 'POST' && complete) {
    if (upload.bytes.length !== upload.size || createHash('sha256').update(upload.bytes).digest('hex') !== upload.sha256) return fail('invalid_upload', 400);
    const data = upload.sealed ? '' : Buffer.from(upload.bytes).toString('base64');
    const result = upload.sealed
      ? await postRoomMessage(deps, { token, roomId, id, text: upload.sealed, replyToId: upload.replyToId, image: undefined, file: undefined,
        sealedMedia: { kind: upload.kind, bytes: upload.bytes } })
      : await postRoomMessage(deps, { token, roomId, id, text: undefined, replyToId: upload.replyToId,
        image: upload.kind === 'image' ? `data:image/jpeg;base64,${data}` : undefined,
        file: upload.kind === 'file' || upload.kind === 'video' ? { name: upload.name, data } : undefined });
    if (!result.ok) return fail(result.error, result.error === 'not_found' ? 404 : 400);
    await deps.repo.deleteUpload(roomId, user.id, id);
    return { offset: upload.size, completed: true, message: result.message, status: 200 };
  }
  return fail('not_found', 404);
}
