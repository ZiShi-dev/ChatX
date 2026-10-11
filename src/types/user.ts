import type { ProfileCosmetics } from '../lib/profileCosmetics';
export type UserRole = 'creator' | 'admin' | 'member';

export type UserStatus = 'online' | 'offline' | 'away';

export type MessageFontId = 'system' | 'clear' | 'rounded' | 'classic';

export interface User extends ProfileCosmetics {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  bio: string;
  color: string;
  messageFont?: MessageFontId;
  /** User-defined badge (Discord-style), visible to everyone. */
  customRoleLabel?: string;
  customRoleColors?: string[];
  avatarUrl?: string;
  bannerUrl?: string;
  lastSeenAt?: string;
}
