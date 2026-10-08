import type { UserRole } from '../types/user';

export function hasAdminAccess(role: UserRole) {
  return role === 'creator' || role === 'admin';
}

/** `creator` is the single ChatX owner. The stored role keeps the name the app already uses. */
export function isOwner(role: UserRole) {
  return role === 'creator';
}

export function canEditRoom(user: { id: string; role: UserRole }, room: { adminId?: string }) {
  return hasAdminAccess(user.role) || room.adminId === user.id;
}

export function canTakeGroupTurn(userId: string, room: { participantIds: string[]; turnUserId?: string; turnOpensAt?: string }, now = Date.now()) {
  if (room.participantIds.length <= 1) return true;
  if (room.turnUserId !== userId) return false;
  if (!room.turnOpensAt) return true;
  const opens = Date.parse(room.turnOpensAt);
  return Number.isFinite(opens) && opens <= now;
}

export function roleLabel(role: UserRole) {
  if (role === 'creator') return 'المنشئ';
  if (role === 'admin') return 'Admin';
  return '';
}
