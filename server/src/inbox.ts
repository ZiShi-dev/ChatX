import type { Deps } from './authService.ts';
import { hashSession } from './session.ts';
import type { InboxKind, InboxNotice } from './types.ts';

export const INBOX_PAGE_SIZE = 30;

const HANDLE = /(?:^|\s)@([\p{L}\p{N}_]+)/gu;
const ID = /^[0-9a-f-]{36}$/i;

export function messageKind(text: string, username: string, repliedToMe: boolean): InboxKind {
  const handles = new Set([...text.matchAll(HANDLE)].map((match) => match[1].toLowerCase()));
  if (username && handles.has(username.toLowerCase())) return 'mention';
  if (handles.has('everyone')) return 'everyone';
  if (repliedToMe) return 'reply';
  if (text.startsWith('تنبيه')) return 'signal';
  return 'message';
}

function preview(text: string) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= 80 ? flat : `${flat.slice(0, 80)}…`;
}

function sessionUser(deps: Deps, token: string) {
  if (!token) return null;
  return deps.repo.findSessionUser(hashSession(token), new Date(deps.now()));
}

export function inboxView(notice: InboxNotice) {
  return {
    id: notice.messageId,
    conversationId: notice.roomId,
    conversationName: notice.conversationName,
    senderId: notice.senderId,
    senderName: notice.senderName,
    kind: notice.kind,
    createdAt: notice.createdAt.toISOString(),
    preview: notice.deleted ? 'رسالة محذوفة' : preview(notice.text),
    unread: !notice.read,
  };
}

export async function readInbox(deps: Deps, input: { token: string; before: string | null; beforeId: string | null }) {
  const user = await sessionUser(deps, input.token);
  if (!user || user.role !== 'member') return { ok: false as const, error: 'invalid_credentials' as const };
  let before: { at: Date; messageId: string } | null = null;
  if (input.before !== null || input.beforeId !== null) {
    if (!input.before || !input.beforeId || !ID.test(input.beforeId)) return { ok: false as const, error: 'invalid_credentials' as const };
    const at = new Date(input.before);
    if (Number.isNaN(at.getTime())) return { ok: false as const, error: 'invalid_credentials' as const };
    before = { at, messageId: input.beforeId };
  }
  await deps.repo.ensureHome(user.id);
  const [notices, unreadCount] = await Promise.all([
    deps.repo.listNotifications(user.id, INBOX_PAGE_SIZE, before),
    deps.repo.countUnreadNotifications(user.id),
  ]);
  return { ok: true as const, notifications: notices.map(inboxView), unreadCount };
}

export async function markInboxRead(deps: Deps, input: { token: string; ids: unknown; all: unknown; until?: unknown }) {
  const user = await sessionUser(deps, input.token);
  if (!user || user.role !== 'member') return { ok: false as const, error: 'invalid_credentials' as const };
  const now = new Date(deps.now());
  let until: Date | undefined;
  if (input.until !== undefined) {
    if (typeof input.until !== 'string' || !Number.isFinite(Date.parse(input.until))) return { ok: false as const, error: 'invalid_credentials' as const };
    until = new Date(Math.min(now.getTime(), Date.parse(input.until)));
  }
  if (input.all === true) {
    await deps.repo.markNotificationsRead(user.id, 'all', now, until);
    return { ok: true as const, unreadCount: await deps.repo.countUnreadNotifications(user.id) };
  }
  if (!Array.isArray(input.ids) || input.ids.length > INBOX_PAGE_SIZE || input.ids.some((id) => typeof id !== 'string' || !ID.test(id))) {
    return { ok: false as const, error: 'invalid_credentials' as const };
  }
  await deps.repo.markNotificationsRead(user.id, input.ids, now, until);
  return { ok: true as const, unreadCount: await deps.repo.countUnreadNotifications(user.id) };
}

export async function clearInbox(deps: Deps, token: string, until?: unknown) {
  const user = await sessionUser(deps, token);
  if (!user || user.role !== 'member') return { ok: false as const, error: 'invalid_credentials' as const };
  if (until !== undefined && (typeof until !== 'string' || !Number.isFinite(Date.parse(until)))) return { ok: false as const, error: 'invalid_credentials' as const };
  await deps.repo.clearNotifications(user.id, new Date(until === undefined ? deps.now() : Math.min(deps.now(), Date.parse(until as string))));
  return { ok: true as const };
}
