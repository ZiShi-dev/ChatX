export type AuthRole = 'creator' | 'admin' | 'member';

export type AuthUser = {
  googleSub?: string | null;
  id: string;
  email: string;
  displayName: string;
  username: string;
  role: AuthRole;
  bio: string;
  bannerUrl: string | null;
  avatarUrl: string | null;
};

export type ProfilePatch = {
  displayName?: string;
  bio?: string;
  banner?: string | null;
  avatar?: string | null;
};

export interface AuthRepository {
  findUserByGoogleSub(sub:string):Promise<AuthUser | null>;
  bindGoogleSub(id:string,sub:string):Promise<boolean>;
  readRoomSync(roomId: string, userId: string, cursor: string | null): Promise<RoomSync | null>;
  beginUpload(upload: Upload, at: Date): Promise<Upload | null>;
  readUpload(roomId: string, ownerId: string, id: string, at: Date): Promise<Upload | null>;
  appendUpload(roomId: string, ownerId: string, id: string, offset: number, bytes: Uint8Array, at: Date): Promise<Upload | null>;
  deleteUpload(roomId: string, ownerId: string, id: string): Promise<void>;
  findUserById(id: string): Promise<AuthUser | null>;
  listUsers(): Promise<AuthUser[]>;
  insertUser(user: AuthUser): Promise<void>;
  renameMember(id: string, displayName: string): Promise<'ok' | 'taken' | 'missing'>;
  updateMemberProfile(id: string, patch: ProfilePatch): Promise<'ok' | 'missing' | 'taken'>;
  createSession(tokenHash: string, userId: string, expiresAt: Date): Promise<void>;
  findSessionUser(tokenHash: string, now: Date): Promise<AuthUser | null>;
  deleteSession(tokenHash: string): Promise<void>;
  touchPresence(tokenHash: string, presence: 'online' | 'away', now: Date): Promise<boolean>;
  listPresence(now: Date): Promise<Array<{ id: string; presence: 'online' | 'away' | null; lastSeenAt: Date | null }>>;
  ensureHome(userId: string): Promise<void>;
  listHome(userId: string, at?: Date): Promise<HomeRoom[]>;
  readGroupTurn(roomId: string, userId: string, at: Date): Promise<{ holderId: string; opensAt: number; members: string[] } | null>;
  listRoomMessages(roomId: string, userId: string, limit: number, page?: { beforeId?: string; aroundId?: string }): Promise<RoomMessage[] | null>;
  changeRoomMessage(roomId: string, userId: string, messageId: string, text: string | null, at: Date): Promise<boolean>;
  updateRoom(roomId: string, userId: string, patch: { name?: string; bio?: string; avatar?: string | null; banner?: string | null }, at: Date): Promise<boolean>;
  addRoomMessage(message: RoomMessage, image?: Uint8Array | null, file?: { name: string; bytes: Uint8Array } | null): Promise<RoomMessage | 'missing' | 'invalid'>;
  readMessageImage(roomId: string, userId: string, messageId: string): Promise<Uint8Array | null>;
  readMessageFile(roomId: string, userId: string, messageId: string): Promise<{ name: string; bytes: Uint8Array } | null>;
  notifyRoomMessage(message: RoomMessage): Promise<void>;
  claimTurnNotice(roomId: string, holderId: string): Promise<boolean>;
  notifyTurnMembers(message: RoomMessage): Promise<void>;
  listNotifications(userId: string, limit: number, before: { at: Date; messageId: string } | null): Promise<InboxNotice[]>;
  countUnreadNotifications(userId: string): Promise<number>;
  markNotificationsRead(userId: string, ids: string[] | 'all', now: Date): Promise<void>;
  clearNotifications(userId: string, now: Date): Promise<void>;
  markRoomRead(roomId: string, userId: string, now: Date, messageId: string): Promise<boolean>;
  setReaction(input: { roomId: string; messageId: string; userId: string; emoji: string | null; at: Date }): Promise<'ok' | 'missing'>;
  listReactions(roomId: string, messageIds?: string[]): Promise<StoredReaction[]>;
  listReaders(roomId: string): Promise<RoomReader[]>;
  createRoom(input: { id: string; kind: 'private' | 'group'; name: string | null; creatorId: string; memberIds: string[]; at: Date }): Promise<string | 'invalid'>;
  listSaved(userId: string, limit: number, beforeId?: string): Promise<SavedItem[]>;
  setSaved(userId: string, messageId: string, saved: boolean, at: Date): Promise<'ok' | 'missing'>;
}

export type RoomSync = { historyHasMore: boolean; messages: RoomMessage[]; reactions: StoredReaction[]; readers: RoomReader[]; removedIds: string[]; cursor: string; reset: boolean; hasMore: boolean };
export type Upload = { id: string; roomId: string; ownerId: string; kind: 'image' | 'file'; name: string; size: number; sha256: string; replyToId: string | null; bytes: Uint8Array; expiresAt: Date };

export type RoomKind = 'global' | 'group' | 'private';

export type InboxKind = 'mention' | 'everyone' | 'reply' | 'signal' | 'message' | 'reaction';

export type StoredReaction = {
  messageId: string;
  userId: string;
  emoji: string;
};

export type RoomReader = {
  userId: string;
  messageId: string;
  readAt: Date;
};

export type SavedItem = {
  messageId: string;
  roomId: string;
  conversationName: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: Date;
  savedAt: Date;
};

export type RoomMessage = {
  id: string;
  roomId: string;
  senderId: string;
  text: string;
  createdAt: Date;
  deleted: boolean;
  replyToId?: string | null;
  imageSize?: number | null;
  fileName?: string | null;
  fileBytes?: number | null;
  editedAt?: Date | null;
  event?: boolean;
};

export type InboxNotice = {
  messageId: string;
  roomId: string;
  conversationName: string;
  senderId: string;
  senderName: string;
  kind: InboxKind;
  text: string;
  createdAt: Date;
  read: boolean;
  deleted: boolean;
};

export type HomeRoom = {
  id: string;
  kind: RoomKind;
  name: string | null;
  createdAt: Date;
  unreadCount: number;
  participantIds: string[];
  lastMessage: RoomMessage | null;
  adminId?: string | null;
  bio?: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  turnUserId?: string | null;
  turnOpensAt?: Date | null;
};
