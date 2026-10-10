export type UserRole = 'creator' | 'admin' | 'member';

export type UserStatus = 'online' | 'offline' | 'away';

export type MessageFontId = 'system' | 'clear' | 'rounded' | 'classic';

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  bio: string;
  color: string;
  messageFont?: MessageFontId;
  avatarUrl?: string;
  bannerUrl?: string;
  lastSeenAt?: string;
}
