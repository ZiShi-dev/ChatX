import { create } from 'zustand';
import type { InboxKind } from './inbox';
export type LiveInboxNotice = { key: string; kind?: InboxKind; conversationId: string; messageId: string; title: string; body: string };
export const useLiveInbox = create<{ notices: LiveInboxNotice[]; push: (notice: LiveInboxNotice) => void; dismiss: (key: string) => void; clear: () => void }>(set => ({
  notices: [],
  push: notice => set(state => ({ notices: [...state.notices.filter(item => item.key !== notice.key), notice].slice(-100) })),
  dismiss: key => set(state => ({ notices: state.notices.filter(item => item.key !== key) })),
  clear: () => set({ notices: [] }),
}));
export function inboxAlertKey(item: { id: string; kind: string; createdAt: string }) { return `${item.kind}:${item.id}:${item.createdAt}`; }
export function liveAlertText(item: { conversationName?: string; senderName?: string; preview: string }, senderName?: string) {
  const group = item.conversationName?.trim(); const sender = item.senderName || senderName || 'ChatX';
  return { title: group || sender, body: group ? `${sender}: ${item.preview}` : item.preview };
}
export function watchingRoom(path: string, roomId: string) {
  return path === `/chat/${roomId}` || path === `/chat/${roomId}/`;
}
