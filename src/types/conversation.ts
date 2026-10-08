export type ConversationType = 'private' | 'group' | 'global';

export interface Conversation {
  id: string;
  type: ConversationType;
  name?: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  participantIds: string[];
  adminId?: string;
  turnUserId?: string;
  turnOpensAt?: string;
  lastMessageId?: string;
  unreadCount: number;
  createdAt?: string;
}
