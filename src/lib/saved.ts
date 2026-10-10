import { messagePreview } from './media';
import type { Message, MessageType } from '../types/message';

export type SavedEntry = {
  messageId: string;
  userId: string;
  conversationId: string;
  conversationName: string;
  senderId: string;
  senderName: string;
  type: MessageType;
  preview: string;
  createdAt: string;
  savedAt: string;
  /** End-to-end envelope from the server; removed once decrypted. */
  sealed?: string;
};

export function savedPreview(text: string) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= 80 ? flat : `${flat.slice(0, 80)}…`;
}

export function toSavedEntry(
  message: Message,
  userId: string,
  conversationName: string,
  senderName: string,
  savedAt = new Date().toISOString(),
): SavedEntry | null {
  if (message.deletedForEveryone) return null;
  return {
    messageId: message.id,
    userId,
    conversationId: message.conversationId,
    conversationName,
    senderId: message.senderId,
    senderName,
    type: message.type,
    preview: messagePreview(message),
    createdAt: message.createdAt,
    savedAt,
  };
}

export function toggleSaved(entries: SavedEntry[], entry: SavedEntry) {
  const exists = entries.some((item) => item.userId === entry.userId && item.messageId === entry.messageId);
  if (exists) return entries.filter((item) => item.userId !== entry.userId || item.messageId !== entry.messageId);
  return [entry, ...entries];
}

const SERVER_ID = /^[0-9a-f-]{36}$/i;

export function readSavedPayload(payload: unknown, userId: string): SavedEntry[] | null {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { saved?: unknown }).saved)) return null;
  const entries: SavedEntry[] = [];
  for (const item of (payload as { saved: unknown[] }).saved) {
    if (!item || typeof item !== 'object') return null;
    const row = item as Record<string, unknown>;
    if (typeof row.messageId !== 'string' || !SERVER_ID.test(row.messageId)) return null;
    if (typeof row.conversationId !== 'string' || !SERVER_ID.test(row.conversationId)) return null;
    if (typeof row.senderId !== 'string' || !SERVER_ID.test(row.senderId)) return null;
    if (typeof row.conversationName !== 'string' || row.conversationName.length < 1 || row.conversationName.length > 40) return null;
    if (typeof row.senderName !== 'string' || row.senderName.length < 1 || row.senderName.length > 40) return null;
    if (row.type !== 'text' || typeof row.preview !== 'string' || row.preview.length > 81) return null;
    if (typeof row.createdAt !== 'string' || typeof row.savedAt !== 'string') return null;
    entries.push({
      messageId: row.messageId,
      userId,
      conversationId: row.conversationId,
      conversationName: row.conversationName,
      senderId: row.senderId,
      senderName: row.senderName,
      type: 'text',
      preview: row.preview,
      createdAt: row.createdAt,
      savedAt: row.savedAt,
      ...(typeof row.sealed === 'string' && row.sealed.startsWith('e2e1.') && row.sealed.length <= 16_400 ? { sealed: row.sealed } : {}),
    });
  }
  return entries;
}

export function savedFor(entries: SavedEntry[], userId: string, conversationId?: string) {
  return entries.filter((item) => item.userId === userId && (!conversationId || item.conversationId === conversationId));
}
