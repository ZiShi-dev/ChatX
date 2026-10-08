import type { Conversation } from '../types/conversation';
import type { Message } from '../types/message';
import type { User } from '../types/user';

export type ChatSnapshot = { conversations: Conversation[]; messages: Message[]; users: User[] };
const MAX_CACHE_CHARS = 1_800_000;
const MAX_PENDING = 40;
export const MAX_CACHED_MESSAGES = 300;

function cacheKey(userId: string) { return `chatx.chat.v1.${userId}`; }

export function boundedSnapshot(snapshot: ChatSnapshot): ChatSnapshot {
  const pending = snapshot.messages.filter((message) => message.status !== 'sent');
  if (pending.length > MAX_PENDING) throw new Error('outbox_full');
  const recent = snapshot.messages.filter((message) => message.status === 'sent')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).slice(-MAX_CACHED_MESSAGES);
  const messages = [...recent, ...pending].map((message): Message => {
    if (!message.media) return { ...message, status: message.status === 'sending' ? 'pending' : message.status, uploadProgress: undefined, downloadProgress: undefined };
    const durable = message.status !== 'sent' && message.media.localPreviewUrl?.startsWith('data:');
    return {
      ...message, status: message.status === 'sending' ? 'pending' : message.status,
      uploadProgress: undefined, downloadProgress: undefined,
      media: { ...message.media, localPreviewUrl: durable ? message.media.localPreviewUrl : undefined, state: durable ? 'cached' : 'remote' },
    };
  });
  return { ...snapshot, messages };
}

export function saveChatSnapshot(userId: string, snapshot: ChatSnapshot) {
  const data = JSON.stringify(boundedSnapshot(snapshot));
  if (data.length > MAX_CACHE_CHARS) throw new Error('outbox_full');
  localStorage.setItem(cacheKey(userId), data);
}

export function loadChatSnapshot(userId: string): ChatSnapshot | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw || raw.length > MAX_CACHE_CHARS) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const row = value as ChatSnapshot;
    if (!Array.isArray(row.conversations) || !Array.isArray(row.messages) || !Array.isArray(row.users)) return null;
    if (row.users.some((user) => !user || typeof user.id !== 'string' || typeof user.username !== 'string' || typeof user.displayName !== 'string' || typeof user.bio !== 'string' || typeof user.color !== 'string' || !['creator', 'admin', 'member'].includes(user.role) || !['online', 'offline', 'away'].includes(user.status))) return null;
    if (row.conversations.some((room) => !room || typeof room.id !== 'string' || !Array.isArray(room.participantIds) || !room.participantIds.includes(userId))) return null;
    const rooms = new Set(row.conversations.map((room) => room.id));
    if (row.messages.some((message) => !message || typeof message.id !== 'string' || !rooms.has(message.conversationId) || typeof message.createdAt !== 'string' || !['text', 'image', 'video', 'file', 'link'].includes(message.type) || !['sent', 'pending', 'sending', 'failed'].includes(message.status))) return null;
    return boundedSnapshot(row);
  } catch { return null; }
}

export function releaseMedia(messages: Message[]) {
  for (const message of messages) {
    const url = message.media?.localPreviewUrl;
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
  }
}
