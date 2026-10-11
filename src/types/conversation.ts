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
  /** Main room only. People outside the member list no longer see it. */
  closed?: boolean;
  /** Private chat only. Absent means no friendship yet. */
  friend?: 'outgoing' | 'incoming' | 'friends';
  /** Notes privées avec soi-même, comme « Message yourself ». */
  self?: boolean;
}
