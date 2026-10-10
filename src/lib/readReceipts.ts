import type { Message } from '../types/message';
import type { User } from '../types/user';

export type ReadCursors = Record<string, Record<string, string>>;
export type ReadTimes = Record<string, Record<string, string>>;

export type ReceiptRow = {
  user: User;
  seen: boolean;
  seenAt?: string;
};

export function advanceCursor(
  cursors: ReadCursors,
  messages: Message[],
  conversationId: string,
  userId: string,
  messageId: string,
): ReadCursors {
  const message = messages.find((item) => item.id === messageId && item.conversationId === conversationId);
  if (!message || message.deletedForEveryone) return cursors;
  const currentId = cursors[conversationId]?.[userId];
  if (currentId) {
    const current = messages.find((item) => item.id === currentId);
    if (current && (current.createdAt > message.createdAt || (current.createdAt === message.createdAt && current.id >= message.id))) return cursors;
  }
  return {
    ...cursors,
    [conversationId]: { ...(cursors[conversationId] ?? {}), [userId]: messageId },
  };
}

export function noteReadTime(
  times: ReadTimes,
  before: ReadCursors,
  after: ReadCursors,
  conversationId: string,
  userId: string,
  at: string,
): ReadTimes {
  if (before === after || before[conversationId]?.[userId] === after[conversationId]?.[userId]) return times;
  return {
    ...times,
    [conversationId]: { ...(times[conversationId] ?? {}), [userId]: at },
  };
}

export function seenAtFor(cursorId: string | undefined, seenAt: string | undefined, messages: Message[], messageId: string) {
  if (!hasSeenMessage(cursorId, messages, messageId)) return undefined;
  return seenAt ?? messages.find((item) => item.id === cursorId)?.createdAt;
}

export function hasSeenMessage(cursorId: string | undefined, messages: Message[], messageId: string) {
  if (!cursorId) return false;
  if (cursorId === messageId) return true;
  const cursor = messages.find((item) => item.id === cursorId);
  const target = messages.find((item) => item.id === messageId);
  if (!cursor || !target || cursor.conversationId !== target.conversationId) return false;
  return cursor.createdAt > target.createdAt || (cursor.createdAt === target.createdAt && cursor.id >= target.id);
}

export function facesOnMessage(
  cursorByUser: Record<string, string>,
  message: Message,
  currentUserId: string,
  users: Map<string, User>,
) {
  if (message.status !== 'sent' || message.deletedForEveryone || message.event) return [];
  const faces: User[] = [];
  for (const [userId, messageId] of Object.entries(cursorByUser)) {
    if (userId === currentUserId || messageId !== message.id) continue;
    const user = users.get(userId);
    if (user) faces.push(user);
  }
  return faces;
}
