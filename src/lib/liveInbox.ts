import { create } from 'zustand';
import type { InboxKind } from './inbox';
export type LiveInboxNotice = {
  count?: number;
  createdAt?: string;
  key: string;
  kind?: InboxKind;
  conversationType?: 'private' | 'group' | 'global';
  conversationId: string;
  messageId: string;
  title: string;
  body: string;
  senderName?: string;
  context?: string;
  preview?: string;
  avatarUrl?: string;
  color?: string;
};
const dismissed = new Set<string>();
export const useLiveInbox = create<{ notices: LiveInboxNotice[]; push: (notice: LiveInboxNotice) => void; dismiss: (key: string) => void; clear: () => void }>(set => ({
  notices: [],
  push: notice => {
    if (dismissed.has(notice.key)) return;
    set(state => {
      const previous = state.notices.find(item => item.conversationId === notice.conversationId);
      const older = previous?.createdAt && notice.createdAt && Date.parse(notice.createdAt) < Date.parse(previous.createdAt);
      if (previous && previous.key !== notice.key) {
        dismissed.add(older ? notice.key : previous.key);
        while (dismissed.size > 300) dismissed.delete(dismissed.values().next().value!);
      }
      const grouped = { ...(older ? previous : notice), count: previous ? (previous.count ?? 1) + (previous.key === notice.key ? 0 : 1) : 1 };
      const notices = state.notices.filter(item => item.conversationId !== notice.conversationId);
      const index = previous ? state.notices.indexOf(previous) : notices.length;
      notices.splice(index, 0, grouped);
      return { notices: notices.slice(-20) };
    });
  },
  dismiss: key => { dismissed.add(key); while (dismissed.size > 300) dismissed.delete(dismissed.values().next().value!); set(state => ({ notices: state.notices.filter(item => item.key !== key) })); },
  clear: () => { dismissed.clear(); set({ notices: [] }); },
}));
export function inboxAlertKey(item: { id: string; kind: string; createdAt: string }) { return `${item.kind}:${item.id}:${item.createdAt}`; }
export function liveAlertText(item: { conversationName?: string; senderName?: string; preview: string }, senderName?: string) {
  const group = item.conversationName?.trim(); const sender = item.senderName || senderName || 'ChatX';
  return { title: group || sender, body: group ? `${sender}: ${item.preview}` : item.preview };
}
export function watchingRoom(path: string, roomId: string) {
  return path === `/chat/${roomId}` || path === `/chat/${roomId}/`;
}
