import type { Conversation } from '../types/conversation';
import type { Message } from '../types/message';
import type { User, UserStatus } from '../types/user';

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function formatMessageTime(iso: string) {
  return new Intl.DateTimeFormat('ar', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatClock(iso: string) {
  return formatMessageTime(iso);
}

export function formatConversationTime(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return formatClock(iso);
  return new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'short' }).format(date);
}

export function formatNotificationTime(iso: string, now = Date.now()) {
  const date = new Date(iso);
  const delta = now - date.getTime();
  if (delta >= 0 && delta < 60_000) return 'الآن';
  if (delta >= 0 && delta < 60 * 60_000) return `منذ ${Math.max(1, Math.round(delta / 60_000))} د`;
  const today = new Date(now);
  if (date.toDateString() === today.toDateString()) return `اليوم ${formatClock(iso)}`;
  const yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'أمس';
  return formatConversationTime(iso);
}

export function formatMessageDay(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'اليوم';
  if (date.toDateString() === yesterday.toDateString()) return 'أمس';
  return new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

export function statusLabel(status: UserStatus) {
  if (status === 'online') return 'متصل';
  if (status === 'away') return 'بعيد';
  return 'غير متصل';
}

export function otherParticipant(conversation: Conversation, currentUserId: string, users: User[]) {
  const otherId = conversation.participantIds.find((id) => id !== currentUserId);
  return users.find((user) => user.id === otherId);
}

export function deletedPrivatePeer(conversation: Conversation, currentUserId: string, users: User[]) {
  if (conversation.type !== 'private') return false;
  const otherId = conversation.participantIds.find((id) => id !== currentUserId);
  if (!otherId) return true;
  return !users.some((user) => user.id === otherId);
}

export function conversationTitle(conversation: Conversation, currentUserId: string, users: User[]) {
  if (conversation.type === 'private') {
    if (deletedPrivatePeer(conversation, currentUserId, users)) return 'حساب محذوف';
    return otherParticipant(conversation, currentUserId, users)?.displayName ?? 'محادثة خاصة';
  }
  return conversation.name ?? 'مجموعة';
}

export function membersOf(conversation: Conversation, users: User[]) {
  return users.filter((user) => conversation.participantIds.includes(user.id));
}

export function lastMessageOf(conversation: Conversation, messages: Message[]) {
  if (!conversation.lastMessageId) return undefined;
  return messages.find((message) => message.id === conversation.lastMessageId);
}

export function isPrivateBetween(conversation: Conversation, firstId: string, secondId: string) {
  if (conversation.type !== 'private') return false;
  const ids = [...conversation.participantIds].sort();
  const expected = [firstId, secondId].sort();
  return ids.length === 2 && ids[0] === expected[0] && ids[1] === expected[1];
}

export function sortByLatest(conversations: Conversation[], messages: Message[]) {
  const timeOf = (conversation: Conversation) =>
    lastMessageOf(conversation, messages)?.createdAt ?? conversation.createdAt ?? '';
  return [...conversations].sort((a, b) => timeOf(b).localeCompare(timeOf(a)));
}

export function isGlobalConversation(conversation: Pick<Conversation, 'type'>) {
  return conversation.type === 'global';
}

export function canDeleteConversation(conversation: Pick<Conversation, 'type'>) {
  return conversation.type !== 'global';
}

export function canLeaveConversation(conversation: Pick<Conversation, 'type'>) {
  return conversation.type !== 'global';
}

export function recentConversations(conversations: Conversation[], messages: Message[]) {
  return sortByLatest(
    conversations.filter((conversation) => conversation.type !== 'global'),
    messages,
  );
}

export function unreadStart(length: number, unread: number) {
  if (unread <= 0 || length <= 0) return -1;
  return Math.max(0, length - unread);
}

export function unreadAbove(unread: number, total: number, visible: number) {
  if (unread <= 0 || total <= 0 || visible <= 0) return 0;
  const firstUnread = Math.max(0, total - unread);
  const firstVisible = Math.max(0, total - visible);
  return Math.max(0, firstVisible - firstUnread);
}

export function unreadOnScreen(unread: number, total: number, visible: number) {
  if (unread <= 0 || total <= 0 || visible <= 0) return 0;
  const firstUnread = Math.max(0, total - unread);
  const firstVisible = Math.max(0, total - visible);
  return Math.max(0, total - Math.max(firstUnread, firstVisible));
}

export function resumeMessageId(messageIds: string[], cursorId: string, unread: number) {
  if (unread <= 0 || !cursorId) return '';
  const index = messageIds.indexOf(cursorId);
  if (index < 0 || index >= messageIds.length - 1) return '';
  return cursorId;
}

export function catchUpLabel(count: number) {
  if (count <= 0) return '';
  if (count === 1) return 'رسالة جديدة';
  if (count === 2) return 'رسالتان جديدتان';
  if (count <= 10) return `${count} رسائل جديدة`;
  return `${count} رسالة جديدة`;
}

export function unreadDividerLabel(count: number) {
  if (count <= 0) return '';
  if (count === 1) return 'رسالة واحدة غير مقروءة';
  if (count === 2) return 'رسالتان غير مقروءتين';
  if (count <= 10) return `${count} رسائل غير مقروءة`;
  return `${count} رسالة غير مقروءة`;
}

export function roomSummary(members: number, online: number) {
  const people = members === 1 ? 'عضو واحد' : members === 2 ? 'عضوان' : `${members} أعضاء`;
  const presence = online === 1 ? 'متصل واحد' : online === 2 ? 'متصلان' : `${online} متصلون`;
  return `${people} • ${presence}`;
}
