import type { InviteCode } from '../types/invite';
import { sanitizeMessageFont, sanitizeUserColor } from './userStyle';
import type { User, UserRole } from '../types/user';

const COLORS = ['#4d7ea8', '#a56b7a', '#c4893a', '#6f8f72', '#5f8f8a', '#3d9b84'];
const CODE = /^CHATX(?:-[A-Z0-9]{4}){4}$/;
const ID = /^[0-9a-f-]{36}$/i;

export function colorForId(id: string) {
  let total = 0;
  for (const char of id) total += char.charCodeAt(0);
  return COLORS[total % COLORS.length] ?? COLORS[0];
}

function asRole(value: unknown): UserRole | null {
  if (value === 'creator' || value === 'admin' || value === 'member') return value;
  return null;
}

export function readDirectoryUser(value: unknown): User | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const role = asRole(data.role);
  if (typeof data.id !== 'string' || !ID.test(data.id) || !role) return null;
  if (typeof data.displayName !== 'string' || data.displayName.trim().length < 1 || data.displayName.length > 40) return null;
  if (typeof data.username !== 'string') return null;
  // eslint-disable-next-line no-control-regex -- Strip control characters from untrusted input.
  const username = data.username.replace(/[\u0000-\u001f]/g, '').trim();
  if (username.length < 2 || username.length > 40) return null;
  // eslint-disable-next-line no-control-regex -- Strip control characters from untrusted input.
  const bio = typeof data.bio === 'string' ? data.bio.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  if (bio.length > 160) return null;
  const bannerUrl = typeof data.bannerUrl === 'string' ? data.bannerUrl : '';
  if (bannerUrl && (!bannerUrl.startsWith('data:image/jpeg;base64,/9j/') || bannerUrl.length > 180_000)) return null;
  const avatarUrl = typeof data.avatarUrl === 'string' ? data.avatarUrl : '';
  if (avatarUrl && (!avatarUrl.startsWith('data:image/jpeg;base64,/9j/') || avatarUrl.length > 80_000)) return null;
  const color = typeof data.color === 'string' ? sanitizeUserColor(data.color, colorForId(data.id)) : colorForId(data.id);
  const messageFont = sanitizeMessageFont(data.messageFont);
  return {
    id: data.id,
    displayName: data.displayName.trim(),
    username,
    role,
    status: 'offline',
    bio,
    color,
    ...(messageFont !== 'system' ? { messageFont } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(bannerUrl ? { bannerUrl } : {}),
  };
}

export function readDirectoryUsers(payload: unknown): User[] | null {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { users?: unknown }).users)) return null;
  const users: User[] = [];
  for (const item of (payload as { users: unknown[] }).users) {
    const user = readDirectoryUser(item);
    if (!user) return null;
    users.push(user);
  }
  return users;
}

function readInvite(value: unknown): InviteCode | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (typeof data.id !== 'string' || !ID.test(data.id)) return null;
  if (typeof data.code !== 'string' || !CODE.test(data.code)) return null;
  if (typeof data.isActive !== 'boolean') return null;
  if (data.usedBy !== null && (typeof data.usedBy !== 'string' || !ID.test(data.usedBy))) return null;
  if (typeof data.expiresAt !== 'string' || Number.isNaN(Date.parse(data.expiresAt))) return null;
  return { id: data.id, code: data.code, isActive: data.isActive, usedBy: data.usedBy, expiresAt: data.expiresAt };
}

export function readInvites(payload: unknown): InviteCode[] | null {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { invites?: unknown }).invites)) return null;
  const invites: InviteCode[] = [];
  for (const item of (payload as { invites: unknown[] }).invites) {
    const invite = readInvite(item);
    if (!invite) return null;
    invites.push(invite);
  }
  return invites;
}

export function readInviteRecord(payload: unknown): InviteCode | null {
  if (!payload || typeof payload !== 'object') return null;
  return readInvite((payload as { invite?: unknown }).invite);
}

export function readInviteAccess(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const access = (payload as { access?: unknown }).access;
  if (access === 'new' || access === 'return' || access === 'setup' || access === 'inactive' || access === 'unknown') return access;
  return null;
}

export function readRedeemedUser(payload: unknown): User | null {
  if (!payload || typeof payload !== 'object') return null;
  const access = readInviteAccess(payload);
  if (access !== 'new' && access !== 'return') return null;
  return readDirectoryUser((payload as { user?: unknown }).user);
}
