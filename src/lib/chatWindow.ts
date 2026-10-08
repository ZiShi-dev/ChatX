import type { Message } from '../types/message';

export function mergeRoomWindow(current: Message[], incoming: Message[], roomId: string, mode: 'latest' | 'older' | 'around') {
  const incomingIds = new Set(incoming.map((item) => item.id));
  const existing = current.filter((item) => item.conversationId === roomId && item.status === 'sent');
  const connected = mode === 'older' || (mode === 'latest' && existing.some((item) => incomingIds.has(item.id)));
  const sent = [...(connected ? existing.filter((item) => !incomingIds.has(item.id)) : []), ...incoming]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const kept = mode === 'older' ? sent.slice(0, 300) : sent.slice(-300);
  const pending = current.filter((item) => item.conversationId === roomId && item.status !== 'sent' && !incomingIds.has(item.id));
  return [...current.filter((item) => item.conversationId !== roomId), ...kept, ...pending];
}
