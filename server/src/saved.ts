import type { Deps } from './authService.ts';
import { hashSession } from './session.ts';
import { isSealed } from './sealed.ts';
import type { SavedItem } from './types.ts';

export const SAVED_PAGE_SIZE = 30;

const MESSAGE_ID = /^[0-9a-f-]{36}$/i;

function preview(text: string) {
  if (isSealed(text)) return 'رسالة مشفرة';
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= 80 ? flat : `${flat.slice(0, 80)}…`;
}

function sessionUser(deps: Deps, token: string) {
  if (!token) return null;
  return deps.repo.findSessionUser(hashSession(token), new Date(deps.now()));
}

export function savedView(item: SavedItem) {
  return {
    messageId: item.messageId,
    conversationId: item.roomId,
    conversationName: item.conversationName,
    senderId: item.senderId,
    senderName: item.senderName,
    type: 'text' as const,
    preview: preview(item.text),
    ...(isSealed(item.text) ? { sealed: item.text } : {}),
    createdAt: item.createdAt.toISOString(),
    savedAt: item.savedAt.toISOString(),
  };
}

export async function readSaved(deps: Deps, token: string, beforeId?: string) {
  const user = await sessionUser(deps, token);
  if (!user || user.role !== 'member') return { ok: false as const, error: 'invalid_credentials' as const };
  if (beforeId && !MESSAGE_ID.test(beforeId)) return { ok: false as const, error: 'invalid_credentials' as const };
  const items = await deps.repo.listSaved(user.id, SAVED_PAGE_SIZE + 1, beforeId);
  return { ok: true as const, saved: items.slice(0, SAVED_PAGE_SIZE).map(savedView), hasMore: items.length > SAVED_PAGE_SIZE };
}

export async function keepMessage(deps: Deps, input: { token: string; messageId: unknown; saved: unknown }) {
  if (typeof input.messageId !== 'string' || !MESSAGE_ID.test(input.messageId) || typeof input.saved !== 'boolean') {
    return { ok: false as const, error: 'invalid_credentials' as const };
  }
  const user = await sessionUser(deps, input.token);
  if (!user || user.role !== 'member') return { ok: false as const, error: 'invalid_credentials' as const };
  const result = await deps.repo.setSaved(user.id, input.messageId, input.saved, new Date(deps.now()));
  if (result === 'missing') return { ok: false as const, error: 'not_found' as const };
  return { ok: true as const };
}
