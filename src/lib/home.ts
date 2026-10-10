import { readDirectoryUser } from './directory';
import { firstUrl, linkDraft } from './link';
import type { Conversation, ConversationType } from '../types/conversation';
import type { Message, MessageReaction } from '../types/message';
import type { User } from '../types/user';

const SERVER_ID = /^[0-9a-f-]{36}$/i;

export const SERVER_GLOBAL_ROOM_ID = '00000000-0000-4000-8000-000000000001';

export function mergeHomeMessages(current: Message[], previews: Message[], roomIds: string[], fullRoomIds: string[]) {
  const rooms = new Set(roomIds);
  const full = new Set(fullRoomIds);
  const pending = current.filter((message) => rooms.has(message.conversationId) && message.status !== 'sent');
  const kept = current.filter((message) => full.has(message.conversationId) && message.status === 'sent' && rooms.has(message.conversationId));
  const seen = new Set([...pending, ...kept].map((message) => message.id));
  const stubs = previews.filter((message) => !full.has(message.conversationId) && !seen.has(message.id));
  const newer = previews.filter((message) => full.has(message.conversationId) && !seen.has(message.id));
  return [...kept, ...stubs, ...newer, ...pending];
}

export function isServerId(id: string) {
  return SERVER_ID.test(id);
}

export type HomePayload = {
  conversations: Conversation[];
  messages: Message[];
  users: User[];
};

function asType(value: unknown): ConversationType | null {
  if (value === 'global' || value === 'group' || value === 'private') return value;
  return null;
}

function readServerConversation(row: unknown): { conversation: Conversation; message?: Message } | null {
  if (!row || typeof row !== 'object') return null;
  const data = row as Record<string, unknown>;
  const type = asType(data.type);
  if (typeof data.id !== 'string' || !SERVER_ID.test(data.id) || !type) return null;
  if (!Array.isArray(data.participantIds) || data.participantIds.some((id) => typeof id !== 'string' || !SERVER_ID.test(id))) return null;
  if (typeof data.unreadCount !== 'number' || data.unreadCount < 0 || typeof data.createdAt !== 'string') return null;
  const name = typeof data.name === 'string' ? data.name : undefined;
  if (type === 'global' && !name) return null;
  if (type === 'group' && !name) return null;
  const conversation: Conversation = {
    id: data.id,
    type,
    participantIds: data.participantIds as string[],
    unreadCount: Math.floor(data.unreadCount),
    createdAt: data.createdAt,
    ...(name ? { name } : {}),
    ...(typeof data.adminId === 'string' && isServerId(data.adminId) ? { adminId: data.adminId } : {}),
    ...(typeof data.bio === 'string' ? { bio: data.bio } : {}),
    ...(typeof data.avatarUrl === 'string' ? { avatarUrl: data.avatarUrl } : {}),
    ...(typeof data.bannerUrl === 'string' ? { bannerUrl: data.bannerUrl } : {}),
    ...(type !== 'private' && typeof data.turnUserId === 'string' && isServerId(data.turnUserId) ? { turnUserId: data.turnUserId } : {}),
    ...(type !== 'private' && typeof data.turnOpensAt === 'string' && Number.isFinite(Date.parse(data.turnOpensAt)) ? { turnOpensAt: data.turnOpensAt } : {}),
  };
  const last = data.lastMessage;
  if (last == null) return { conversation };
  if (typeof last !== 'object') return null;
  const message = last as Record<string, unknown>;
  if (typeof message.id !== 'string' || !SERVER_ID.test(message.id)) return null;
  if (typeof message.senderId !== 'string' || !SERVER_ID.test(message.senderId)) return null;
  if (typeof message.text !== 'string' || typeof message.createdAt !== 'string' || typeof message.deleted !== 'boolean') return null;
  if (message.type != null && message.type !== 'text' && message.type !== 'image' && message.type !== 'file') return null;
  const fileName = typeof message.fileName === 'string' && message.fileName.trim() && message.fileName.length <= 120 ? message.fileName : '';
  if (message.type === 'file' && !message.deleted && !fileName) return null;
  const replyToId = typeof message.replyToId === 'string' && SERVER_ID.test(message.replyToId) ? message.replyToId : undefined;
  const image = message.type === 'image' && !message.deleted;
  const file = message.type === 'file' && !message.deleted && Boolean(fileName);
  conversation.lastMessageId = message.id;
  return {
    conversation,
    message: {
      id: message.id,
      conversationId: data.id,
      senderId: message.senderId,
      type: image ? 'image' : file ? 'file' : 'text',
      text: message.text,
      status: 'sent',
      createdAt: message.createdAt,
      ...(image ? { media: { fileName: 'photo.jpg', fileSize: 1, state: 'remote' as const } } : {}),
      ...(file ? { media: { fileName, fileSize: 1, state: 'remote' as const } } : {}),
      ...(message.deleted ? { deletedForEveryone: true } : {}),
      ...(message.event === true ? { event: true } : {}),
      ...(replyToId ? { replyToId } : {}),
    },
  };
}

export function readOpenedRoom(payload: unknown): { conversation: Conversation; users: User[] } | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as { conversation?: unknown; users?: unknown };
  const opened = readServerConversation(data.conversation);
  if (!opened || opened.conversation.type === 'global' || !Array.isArray(data.users)) return null;
  const users: User[] = [];
  for (const item of data.users) {
    const user = readDirectoryUser(item);
    if (!user) return null;
    users.push(user);
  }
  return { conversation: opened.conversation, users };
}

export function readUpdatedRoom(payload: unknown): { conversation: Conversation; message?: Message } | null {
  if (!payload || typeof payload !== 'object') return null;
  return readServerConversation((payload as { conversation?: unknown }).conversation);
}

export function readHomePayload(payload: unknown): HomePayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as { conversations?: unknown; users?: unknown };
  if (!Array.isArray(data.conversations) || !Array.isArray(data.users)) return null;
  const conversations: Conversation[] = [];
  const messages: Message[] = [];
  for (const item of data.conversations) {
    const opened = readServerConversation(item);
    if (!opened) return null;
    conversations.push(opened.conversation);
    if (opened.message) messages.push(opened.message);
  }
  if (!conversations.some((conversation) => conversation.type === 'global')) return null;
  const users: User[] = [];
  for (const item of data.users) {
    const user = readDirectoryUser(item);
    if (!user) return null;
    users.push(user);
  }
  return { conversations, messages, users };
}

export function readRoomMessages(payload: unknown, conversationId: string): Message[] | null {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { messages?: unknown }).messages)) return null;
  const messages: Message[] = [];
  for (const item of (payload as { messages: unknown[] }).messages) {
    if (!item || typeof item !== 'object') return null;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || !SERVER_ID.test(row.id)) return null;
    if (row.conversationId !== conversationId || typeof row.senderId !== 'string' || !SERVER_ID.test(row.senderId)) return null;
    if (typeof row.text !== 'string' || typeof row.createdAt !== 'string' || typeof row.deleted !== 'boolean') return null;
    if (row.type != null && row.type !== 'text' && row.type !== 'image' && row.type !== 'file') return null;
    const image = row.type === 'image' && !row.deleted;
    const fileName = typeof row.fileName === 'string' && row.fileName.trim() && row.fileName.length <= 120 ? row.fileName : '';
    const file = row.type === 'file' && !row.deleted;
    // Sealed attachments carry 28 extra bytes of AES-GCM IV and tag.
    if (image && (typeof row.fileSize !== 'number' || !Number.isInteger(row.fileSize) || row.fileSize < 1 || row.fileSize > 60_028)) return null;
    if (file && (!fileName || typeof row.fileSize !== 'number' || !Number.isInteger(row.fileSize) || row.fileSize < 1 || row.fileSize > 262_172)) return null;
    const replyToId = typeof row.replyToId === 'string' && SERVER_ID.test(row.replyToId) ? row.replyToId : undefined;
    const reactions = readReactions(row.reactions);
    const url = !row.deleted && !image && !file && row.event !== true ? firstUrl(row.text) : '';
    messages.push({
      id: row.id,
      conversationId,
      senderId: row.senderId,
      type: image ? 'image' : file ? 'file' : 'text',
      text: row.text,
      status: 'sent',
      createdAt: row.createdAt,
      ...(image ? { media: { fileName: 'photo.jpg', fileSize: row.fileSize as number, state: 'remote' as const } } : {}),
      ...(file ? { media: { fileName, fileSize: row.fileSize as number, state: 'remote' as const } } : {}),
      ...(row.deleted ? { deletedForEveryone: true } : {}),
      ...(row.event === true ? { event: true } : {}),
      ...(typeof row.editedAt === 'string' ? { editedAt: row.editedAt } : {}),
      ...(replyToId ? { replyToId } : {}),
      ...(reactions ? { reactions } : {}),
      ...(url ? { link: linkDraft(url) } : {}),
    });
  }
  return messages;
}

function readReactions(value: unknown): MessageReaction[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const reactions: MessageReaction[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.emoji !== 'string' || !row.emoji.trim() || [...row.emoji].length > 16) continue;
    if (typeof row.userId !== 'string' || !SERVER_ID.test(row.userId)) continue;
    reactions.push({ emoji: row.emoji, userId: row.userId });
  }
  return reactions.length ? reactions : undefined;
}

export type RoomReaderView = { userId: string; messageId: string; readAt: string };

export function readRoomReaders(payload: unknown): RoomReaderView[] {
  if (!payload || typeof payload !== 'object') return [];
  const rows = (payload as { readers?: unknown }).readers;
  if (!Array.isArray(rows)) return [];
  const readers: RoomReaderView[] = [];
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.userId !== 'string' || !SERVER_ID.test(row.userId)) continue;
    if (typeof row.messageId !== 'string' || !SERVER_ID.test(row.messageId)) continue;
    if (typeof row.readAt !== 'string') continue;
    readers.push({ userId: row.userId, messageId: row.messageId, readAt: row.readAt });
  }
  return readers;
}
