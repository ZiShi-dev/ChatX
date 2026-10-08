import { formatClock } from './conversation';
import type { UserStatus } from '../types/user';

function seenWhen(iso: string, now: number) {
  const clock = formatClock(iso);
  const date = new Date(iso);
  const today = new Date(now);
  if (date.toDateString() === today.toDateString()) return clock;
  const yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `أمس ${clock}`;
  const day = new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'short' }).format(date);
  return `${day} ${clock}`;
}

const SERVER_ID = /^[0-9a-f-]{36}$/i;

export function readPresenceUsers(payload: unknown): Array<{ id: string; status: UserStatus; lastSeenAt?: string }> | null {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { users?: unknown }).users)) return null;
  const rows: Array<{ id: string; status: UserStatus; lastSeenAt?: string }> = [];
  for (const item of (payload as { users: unknown[] }).users) {
    if (!item || typeof item !== 'object') return null;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || !SERVER_ID.test(row.id)) return null;
    if (row.status !== 'online' && row.status !== 'offline' && row.status !== 'away') return null;
    if (row.lastSeenAt != null && (typeof row.lastSeenAt !== 'string' || Number.isNaN(Date.parse(row.lastSeenAt)))) return null;
    rows.push({
      id: row.id,
      status: row.status,
      ...(typeof row.lastSeenAt === 'string' ? { lastSeenAt: row.lastSeenAt } : {}),
    });
  }
  return rows;
}

export function getUserPresence(userId: string, users: Array<{ id: string; status: UserStatus }>): UserStatus {
  return users.find((user) => user.id === userId)?.status ?? 'offline';
}

export function connectionLabel(
  user: { status: UserStatus; lastSeenAt?: string },
  options?: { self?: boolean; now?: number },
) {
  const now = options?.now ?? Date.now();
  if (user.status === 'online') return 'متصل';
  if (user.status === 'away') return 'بعيد';
  if (!user.lastSeenAt) return 'غير متصل';
  return `آخر اتصال ${seenWhen(user.lastSeenAt, now)}`;
}
