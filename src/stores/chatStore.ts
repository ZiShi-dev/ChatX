import { constrainedDevice } from '../lib/deviceBudget';
import { queueRoomRead, queueInboxClear, cacheInbox, pendingReads, queueNotificationReads, overlayPendingReads, flushPendingReads } from '../lib/pendingReads';
import { uploadResumable } from '../lib/resumableUpload';
import { readRoomSync, mergeRoomDelta } from '../lib/roomSync';
import { create } from 'zustand';
import { MESSAGE_PAGE_SIZE, NOTIFICATIONS_PAGE_SIZE, READ_DELAY_MS, READ_STAGGER_MS } from '../constants/chat';
import { CONVERSATIONS, GLOBAL_CHAT_ID } from '../data/conversations';
import { MESSAGES } from '../data/messages';
import { SEED_READ_CURSORS, SEED_READ_TIMES } from '../data/readCursors';
import { applyReaction } from '../lib/reactions';
import { advanceCursor, noteReadTime, type ReadCursors, type ReadTimes } from '../lib/readReceipts';
import { isServerId, mergeHomeMessages, readHomePayload, readOpenedRoom, readRoomMessages, readRoomReaders, readUpdatedRoom, SERVER_GLOBAL_ROOM_ID } from '../lib/home';
import { notificationPreview, reactionNotice, readInboxPayload, readInboxUnread } from '../lib/inbox';
import { ensureRoomKey, openMessageMedia, openMessages, openPreview, sealMessageMedia, sealMessageText } from '../lib/e2e';
import { EVERYONE_HANDLE, mentionedHandles } from '../lib/mention';
import type { InboxItem } from '../lib/inbox';
import { deletedPrivatePeer } from '../lib/conversation';
import { firstUrl, linkDraft, readPreviewPayload, siteHost } from '../lib/link';
import { AdminApiError, adminFetch, adminFetchBlob, invalidateApiSession } from '../lib/adminApi';
import { loadChatSnapshot, saveChatSnapshot, releaseMedia } from '../lib/chatCache';
import { mergeRoomWindow } from '../lib/chatWindow';
import { prepareMedia } from '../lib/mediaPreparation';
import { fitChatImage, jpegDataUrl } from '../lib/chatImage';
import { bytesToBase64, FILE_BYTES_MAX, localMediaBytes, VIDEO_BYTES_MAX } from '../lib/chatFile';
import { ORIGINAL_IMAGE_SIZE, ORIGINAL_VIDEO_SIZE, expectedImageSize, expectedVideoSize } from '../lib/media';
import { isPrivateBetween } from '../lib/conversation';
import { canEditRoom } from '../lib/roles';
import type { Conversation } from '../types/conversation';
import type { User } from '../types/user';
import type { Message, MessageStatus } from '../types/message';
import type { ImageQuality, VideoQuality } from '../types/settings';

function noticedReactions(readIds: string[], messages: Message[], userId: string) {
  const known = new Set(readIds);
  let next: string[] | undefined;
  for (const message of messages) {
    if (!reactionNotice(message, userId) || known.has(message.id)) continue;
    next ??= readIds.slice();
    next.push(message.id);
    known.add(message.id);
  }
  return next ?? readIds;
}

type PickedFile = {
  fileName: string;
  fileSize: number;
  previewUrl?: string;
  duration?: number;
};
import { useAuthStore } from './authStore';
import { useNetworkStore } from './networkStore';
import { useSettingsStore } from './settingsStore';
import { useUserStore } from './userStore';
import { preserveCurrentTurn, readGroupTurnPayload } from '../lib/groupTurn';
import { serverNow, syncServerClock } from '../lib/serverClock';
import { saveOutgoing, loadOutgoing, removeOutgoing, saveReceivedMedia, readReceivedMedia, clearReceivedMedia } from '../lib/durableChat';
import { createOutgoingScheduler } from '../lib/outgoingScheduler';
import { retryDelay, retryableStatus } from '../lib/retry';

const PAGE_SIZE = MESSAGE_PAGE_SIZE;
const readTimers = new Map<string, number[]>();
const timers = new Map<string, number[]>();
const preparing = new Set<string>();
let outgoingReady = false;
const roomSyncCursors = new Map<string,string>();
const roomSyncPending = new Map<string,Promise<boolean>>();

type ChatState = {
  conversations: Conversation[];
  messages: Message[];
  fullRooms: string[];
  roomHasMore: Record<string, boolean>;
  lastError: string;
  typingByConversation: Record<string, string[]>;
  historyLimit: Record<string, number>;
  readCursors: ReadCursors;
  readTimes: ReadTimes;
  sendMessage: (conversationId: string, content: string) => void;
  sendImage: (conversationId: string, quality: ImageQuality, picked?: PickedFile) => void;
  sendVideo: (conversationId: string, quality: VideoQuality, picked?: PickedFile) => void;
  sendFile: (conversationId: string, picked: PickedFile) => void;
  sendLink: (conversationId: string, url: string) => void;
  retryMessage: (messageId: string) => void;
  cancelMessage: (messageId: string) => void;
  downloadMedia: (messageId: string) => void;
  loadLinkPreview: (messageId: string) => void;
  loadOlder: (conversationId: string) => Promise<boolean>;
  revealMessage: (conversationId: string, messageId: string) => void;
  markRead: (conversationId: string, messageId?: string) => Promise<boolean>;
  markAllRead: () => void;
  markNotificationsRead: (ids: string[]) => void;
  clearInbox: () => void;
  inboxClearedAt: string | null;
  inboxReadIds: string[];
  serverInbox: InboxItem[];
  serverUnread: number;
  inboxHasMore: boolean;
  loadInbox: (before?: { at: string; id: string }) => Promise<'ok' | 'local' | 'offline' | 'invalid'>;
  setTyping: (conversationId: string, userIds: string[]) => void;
  openPrivate: (userId: string) => Promise<string>;
  createGroup: (name: string, memberIds: string[]) => Promise<string>;
  updateGroup: (conversationId: string, patch: { name?: string; bio?: string; avatarUrl?: string; bannerUrl?: string | null }) => Promise<boolean>;
  pauseOutgoing: () => void;
  flushOutgoing: () => void;
  resetMediaCache: () => void;
  loadHome: () => Promise<'ok' | 'local' | 'offline' | 'invalid'>;
  dismissDeletedChat: (conversationId: string) => Promise<boolean>;
  loadGroupTurn: (conversationId: string) => Promise<'ok' | 'local' | 'offline' | 'invalid'>;
  loadRoom: (conversationId: string, page?: { beforeId?: string; aroundId?: string; wait?: boolean; signal?: AbortSignal }) => Promise<boolean>;
  editingId: string | null;
  replyingTo: { conversationId: string; messageId: string } | null;
  beginReply: (messageId: string) => void;
  cancelReply: () => void;
  beginEdit: (messageId: string) => void;
  cancelEdit: () => void;
  editMessage: (messageId: string, content: string) => Promise<boolean>;
  deleteForEveryone: (messageId: string) => void;
  toggleReaction: (messageId: string, emoji: string) => void;
  forgetUser: (userId: string) => void;
};

function localGroupLine(actor: string, patch: { name?: string; avatarUrl?: string; bannerUrl?: string | null }) {
  const clauses: string[] = [];
  if (patch.name) clauses.push(`غيّر اسم المجموعة إلى «${patch.name}»`);
  if (patch.avatarUrl) clauses.push('غيّر صورة المجموعة');
  if (patch.bannerUrl) clauses.push('غيّر غلاف المجموعة');
  else if (patch.bannerUrl === null) clauses.push('أزال غلاف المجموعة');
  if (!clauses.length) return '';
  return `${actor.trim() || 'عضو'} ${clauses.join(' و')}`;
}

function clearTimers(id: string) {
  for (const timer of timers.get(id) ?? []) window.clearTimeout(timer);
  timers.delete(id);
}

function patchMessage(id: string, patch: Partial<Message>) {
  useChatStore.setState((state) => ({
    messages: state.messages.map((message) => (message.id === id ? { ...message, ...patch } : message)),
  }));
}

function scheduleDelivery(id: string) {
  clearTimers(id);
  const network = useNetworkStore.getState().network;
  if (network === 'offline') return;
  const step = network === 'slow' ? 1100 : 420;
  const handles = [
    window.setTimeout(() => {
      const current = useChatStore.getState().messages.find((message) => message.id === id);
      if (!current || current.status === 'failed') return;
      patchMessage(id, {
        status: 'sending',
        uploadProgress: current.type === 'text' ? undefined : 37,
      });
    }, step),
    window.setTimeout(() => {
      const current = useChatStore.getState().messages.find((message) => message.id === id);
      if (!current || current.status === 'failed') return;
      patchMessage(id, { status: 'sent', uploadProgress: undefined });
      clearTimers(id);
      watchReads(id);
    }, step * 2),
  ];
  timers.set(id, handles);
}

function clearReadTimers(id: string) {
  for (const timer of readTimers.get(id) ?? []) window.clearTimeout(timer);
  readTimers.delete(id);
}

function watchReads(id: string) {
  clearReadTimers(id);
  const message = useChatStore.getState().messages.find((item) => item.id === id);
  if (!message || message.senderId !== useAuthStore.getState().currentUser.id || message.deletedForEveryone) return;
  if (isServerId(message.conversationId)) return;
  const conversation = useChatStore.getState().conversations.find((item) => item.id === message.conversationId);
  if (!conversation) return;
  const users = useUserStore.getState().users;
  const handles = conversation.participantIds
    .filter((userId) => userId !== message.senderId)
    .flatMap((userId, index) => {
      const user = users.find((item) => item.id === userId);
      if (!user || user.status !== 'online') return [];
      return [
        window.setTimeout(() => {
          const state = useChatStore.getState();
          const current = state.messages.find((item) => item.id === id);
          if (!current || current.deletedForEveryone) return;
          const readCursors = advanceCursor(state.readCursors, state.messages, current.conversationId, userId, current.id);
          useChatStore.setState({
            readCursors,
            readTimes: noteReadTime(state.readTimes, state.readCursors, readCursors, current.conversationId, userId, new Date().toISOString()),
          });
        }, READ_DELAY_MS + index * READ_STAGGER_MS),
      ];
    });
  if (handles.length) readTimers.set(id, handles);
}

function rememberPeople(people: User[]) {
  const users = useUserStore.getState();
  for (const user of people) {
    if (users.users.some((item) => item.id === user.id)) {
      const { status, ...profile } = user;
      users.updateUser(user.id, profile);
    } else users.addUser(user);
  }
}

function rememberConversation(conversation: Conversation) {
  useChatStore.setState((state) => ({
    conversations: state.conversations.some((item) => item.id === conversation.id)
      ? state.conversations.map((item) => (item.id === conversation.id ? { ...item, ...conversation } : item))
      : [conversation, ...state.conversations],
  }));
}

function mergeInbox(current: InboxItem[], page: InboxItem[], older: boolean) {
  const key = (item: InboxItem) => `${item.kind}:${item.id}`;
  const previous = new Map(current.map(item => [key(item), item]));
  page = page.map(item => { const old = previous.get(key(item)); return old && !old.unread && old.createdAt === item.createdAt ? { ...item, unread: false, unreadCount: 0 } : item; });
  if (older) {
    const seen = new Set(current.map(key));
    return [...current, ...page.filter((item) => !seen.has(key(item)))];
  }
  if (page.length < NOTIFICATIONS_PAGE_SIZE) return page;
  const oldest = page[page.length - 1]?.createdAt ?? '';
  const seen = new Set(page.map(key));
  return [...page, ...current.filter((item) => item.createdAt < oldest && !seen.has(key(item)))];
}

function serverText(message: Pick<Message, 'conversationId' | 'type'>) {
  return isServerId(message.conversationId) && message.type === 'text';
}

function serverImage(message: Pick<Message, 'conversationId' | 'type'>) {
  return isServerId(message.conversationId) && message.type === 'image';
}

function serverFile(message: Pick<Message, 'conversationId' | 'type'>) {
  return isServerId(message.conversationId) && message.type === 'file';
}

function serverVideo(message: Pick<Message, 'conversationId' | 'type'>) {
  return isServerId(message.conversationId) && message.type === 'video';
}

function roomMembers(conversationId: string) {
  return useChatStore.getState().conversations.find((room) => room.id === conversationId)?.participantIds ?? [];
}

/** The server cannot read sealed text, so the sender declares who must be alerted. */
function noticeHints(text: string, conversationId: string) {
  const members = new Set(roomMembers(conversationId));
  const people = useUserStore.getState().users.filter((user) => members.has(user.id));
  const handles = new Set(mentionedHandles(text, [...people.map((user) => user.username), EVERYONE_HANDLE]));
  const mentions = handles.size
    ? people.filter((user) => handles.has(user.username.toLowerCase())).map((user) => user.id).slice(0, 50)
    : [];
  return { mentions, everyone: handles.has(EVERYONE_HANDLE), signal: text.startsWith('تنبيه') };
}

function cleanText(value: string | undefined) {
  const text = (value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  return text.length <= 4000 ? text : '';
}

async function publishText(message: Message) {
  const text = cleanText(message.text);
  if (!text) {
    patchMessage(message.id, { status: 'failed' });
    return;
  }
  try {
    const owner = useAuthStore.getState().currentUser.id;
    const sealed = await sealMessageText(owner, message.conversationId, message.id, text, roomMembers(message.conversationId));
    await adminFetch(`/api/rooms/${message.conversationId}/messages`, {
      method: 'POST',
      body: {
        id: message.id,
        text: sealed,
        hints: noticeHints(text, message.conversationId),
        ...(message.replyToId && isServerId(message.replyToId) ? { replyToId: message.replyToId } : {}),
      },
    });
    patchMessage(message.id, { status: 'sent', uploadProgress: undefined });
  } catch (error) { throw error; }
}

async function publishImage(message: Message) {
  const source = message.media?.localPreviewUrl;
  if (!source) {
    patchMessage(message.id, { status: 'failed' });
    return;
  }
  const current = useChatStore.getState().messages.find((item) => item.id === message.id);
  if (!current?.media) throw new Error('invalid_image');
  try {
    const plain = await localMediaBytes(source);
    const sealed = await sealMessageMedia(useAuthStore.getState().currentUser.id, message.conversationId, message.id, plain, '', roomMembers(message.conversationId));
    await uploadResumable({ roomId: message.conversationId, id: message.id, kind: 'image', name: 'photo.jpg', bytes: sealed.bytes, sealed: sealed.body, replyToId: message.replyToId },
      (uploadProgress) => patchMessage(message.id, { uploadProgress }), yieldToTexts, () => {
        const current = useChatStore.getState().messages.find((item) => item.id === message.id);
        return !current || current.status === 'failed' || current.senderId !== useAuthStore.getState().currentUser.id;
      });
    patchMessage(message.id, { status: 'sent', uploadProgress: undefined });
  } catch (error) { throw error; }
}

/** Received media is cached already decrypted, so a cache hit never needs the room key. */
async function openedBlob(owner: string, message: Message, blob: Blob) {
  if (!message.sealedKey) return blob;
  return new Blob([new Uint8Array(await openMessageMedia(owner, message, new Uint8Array(await blob.arrayBuffer())))], { type: blob.type });
}

async function pullServerImage(message: Message) {
  if (!message.media) return;
  patchMessage(message.id, {
    downloadFailed: false,
    downloadProgress: 0,
    media: { ...message.media, state: 'downloading' },
  });
  try {
    const owner = useAuthStore.getState().currentUser.id;
    const cached = await readReceivedMedia(owner, message.id).catch(() => null);
    const blob = cached ?? await openedBlob(owner, message, await adminFetchBlob(`/api/rooms/${message.conversationId}/messages/${message.id}/image`));
    if (owner !== useAuthStore.getState().currentUser.id) return;
    void saveReceivedMedia(owner, message.id, blob).catch(() => undefined);
    const url = jpegDataUrl(new Uint8Array(await blob.arrayBuffer()));
    const current = useChatStore.getState().messages.find((item) => item.id === message.id);
    if (!url || !current?.media) {
      patchMessage(message.id, {
        downloadFailed: true,
        downloadProgress: undefined,
        media: current?.media ? { ...current.media, state: 'remote' } : { ...message.media, state: 'remote' },
      });
      return;
    }
    patchMessage(message.id, {
      downloadFailed: false,
      downloadProgress: undefined,
      media: { ...current.media, localPreviewUrl: url, fileSize: blob.size, state: 'cached' },
    });
    if (!cached) useSettingsStore.getState().addUsage('images', blob.size);
  } catch {
    const current = useChatStore.getState().messages.find((item) => item.id === message.id);
    patchMessage(message.id, {
      downloadFailed: true,
      downloadProgress: undefined,
      media: current?.media ? { ...current.media, state: 'remote' } : undefined,
    });
  }
}

async function yieldToTexts() {
  if (useNetworkStore.getState().network === 'online' && !useSettingsStore.getState().dataSaver) return;
  const pending = useChatStore.getState().messages.filter((message) => message.type === 'text' && isServerId(message.conversationId)
    && message.status === 'pending' && (message.retryAt ?? 0) <= Date.now() && !preparing.has(message.id)
    && !useChatStore.getState().messages.some((other) => other.type === 'text' && other.conversationId === message.conversationId
      && (preparing.has(other.id) || other.status === 'pending' && other.createdAt < message.createdAt)))
    .sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).slice(0,5);
  for (const message of pending) {
    if (useNetworkStore.getState().network === 'offline') return;
    await prepareAndSend(message);
  }
}

async function publishFile(message: Message) {
  const source = message.media?.localPreviewUrl;
  const name = message.media?.fileName?.trim();
  if (!source || !name) {
    patchMessage(message.id, { status: 'failed' });
    return;
  }
  try {
    const bytes = await localMediaBytes(source);
    if (bytes.byteLength < 1 || bytes.byteLength > FILE_BYTES_MAX) {
      patchMessage(message.id, { status: 'failed' });
      return;
    }
    const sealed = await sealMessageMedia(useAuthStore.getState().currentUser.id, message.conversationId, message.id, bytes, name.slice(0, 120), roomMembers(message.conversationId));
    await uploadResumable({ roomId: message.conversationId, id: message.id, kind: 'file', name, bytes: sealed.bytes, sealed: sealed.body, replyToId: message.replyToId },
      (uploadProgress) => patchMessage(message.id, { uploadProgress }), yieldToTexts, () => {
        const current = useChatStore.getState().messages.find((item) => item.id === message.id);
        return !current || current.status === 'failed' || current.senderId !== useAuthStore.getState().currentUser.id;
      });
    const current = useChatStore.getState().messages.find((item) => item.id === message.id);
    patchMessage(message.id, {
      status: 'sent',
      uploadProgress: undefined,
      media: {
        fileName: name,
        fileSize: bytes.byteLength,
        localPreviewUrl: source,
        state: 'cached',
        ...(current?.media?.width ? { width: current.media.width } : {}),
        ...(current?.media?.height ? { height: current.media.height } : {}),
      },
    });
  } catch (error) { throw error; }
}

async function publishVideo(message: Message) {
  const source = message.media?.localPreviewUrl;
  const name = message.media?.fileName?.trim();
  if (!source || !name) {
    patchMessage(message.id, { status: 'failed' });
    return;
  }
  try {
    const bytes = await localMediaBytes(source);
    if (bytes.byteLength < 1 || bytes.byteLength > VIDEO_BYTES_MAX) {
      patchMessage(message.id, { status: 'failed' });
      return;
    }
    const sealed = await sealMessageMedia(useAuthStore.getState().currentUser.id, message.conversationId, message.id, bytes, name.slice(0, 120), roomMembers(message.conversationId));
    await uploadResumable({ roomId: message.conversationId, id: message.id, kind: 'video', name, bytes: sealed.bytes, sealed: sealed.body, replyToId: message.replyToId },
      (uploadProgress) => patchMessage(message.id, { uploadProgress }), yieldToTexts, () => {
        const current = useChatStore.getState().messages.find((item) => item.id === message.id);
        return !current || current.status === 'failed' || current.senderId !== useAuthStore.getState().currentUser.id;
      });
    const current = useChatStore.getState().messages.find((item) => item.id === message.id);
    patchMessage(message.id, {
      status: 'sent',
      uploadProgress: undefined,
      media: {
        fileName: name,
        fileSize: bytes.byteLength,
        localPreviewUrl: source,
        state: 'cached',
        ...(current?.media?.duration ? { duration: current.media.duration } : {}),
      },
    });
  } catch (error) { throw error; }
}

function videoMime(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  return 'video/mp4';
}

async function pullServerVideo(message: Message) {
  if (!message.media) return;
  patchMessage(message.id, {
    downloadFailed: false,
    downloadProgress: 0,
    media: { ...message.media, state: 'downloading' },
  });
  try {
    const owner = useAuthStore.getState().currentUser.id;
    const cached = await readReceivedMedia(owner, message.id).catch(() => null);
    const raw = cached ?? await openedBlob(owner, message, await adminFetchBlob(`/api/rooms/${message.conversationId}/messages/${message.id}/file`));
    if (owner !== useAuthStore.getState().currentUser.id) return;
    const bytes = new Uint8Array(await raw.arrayBuffer());
    if (bytes.byteLength < 1 || bytes.byteLength > VIDEO_BYTES_MAX) throw new Error('size');
    const blob = new Blob([bytes], { type: videoMime(message.media?.fileName || 'video.mp4') });
    void saveReceivedMedia(owner, message.id, blob).catch(() => undefined);
    const current = useChatStore.getState().messages.find((item) => item.id === message.id);
    if (!current?.media) return;
    patchMessage(message.id, {
      downloadFailed: false,
      downloadProgress: undefined,
      media: { ...current.media, localPreviewUrl: URL.createObjectURL(blob), fileSize: blob.size, state: 'cached' },
    });
    if (!cached) useSettingsStore.getState().addUsage('videos', blob.size);
  } catch {
    const current = useChatStore.getState().messages.find((item) => item.id === message.id);
    patchMessage(message.id, {
      downloadFailed: true,
      downloadProgress: undefined,
      media: current?.media ? { ...current.media, state: 'remote' } : undefined,
    });
  }
}

async function pullServerFile(message: Message) {
  if (!message.media) return;
  patchMessage(message.id, {
    downloadFailed: false,
    downloadProgress: 0,
    media: { ...message.media, state: 'downloading' },
  });
  try {
    const owner = useAuthStore.getState().currentUser.id;
    const cached = await readReceivedMedia(owner, message.id).catch(() => null);
    const blob = cached ?? await openedBlob(owner, message, await adminFetchBlob(`/api/rooms/${message.conversationId}/messages/${message.id}/file`));
    if (owner !== useAuthStore.getState().currentUser.id) return;
    void saveReceivedMedia(owner, message.id, blob).catch(() => undefined);
    if (blob.size < 1 || blob.size > FILE_BYTES_MAX) throw new Error('size');
    const current = useChatStore.getState().messages.find((item) => item.id === message.id);
    if (!current?.media) return;
    patchMessage(message.id, {
      downloadFailed: false,
      downloadProgress: undefined,
      media: { ...current.media, localPreviewUrl: URL.createObjectURL(blob), fileSize: blob.size, state: 'cached' },
    });
    if (!cached) useSettingsStore.getState().addUsage('other', blob.size);
  } catch {
    const current = useChatStore.getState().messages.find((item) => item.id === message.id);
    patchMessage(message.id, {
      downloadFailed: true,
      downloadProgress: undefined,
      media: current?.media ? { ...current.media, state: 'remote' } : undefined,
    });
  }
}

function appendMessage(message: Message) {
  useChatStore.setState((state) => ({
    messages: [...state.messages, message],
    conversations: state.conversations.map((conversation) =>
      conversation.id === message.conversationId
        ? { ...conversation, lastMessageId: message.id, unreadCount: 0 }
        : conversation,
    ),
  }));
  if (isServerId(message.conversationId)) {
    patchMessage(message.id, { status: 'pending' });
    if (useNetworkStore.getState().network === 'offline') void prepareAndSend({ ...message, status: 'pending' });
    else outgoing.wake();
    return;
  }
  if (message.status !== 'sent' && message.status !== 'failed') scheduleDelivery(message.id);
}

function persistChat() {
  const me = useAuthStore.getState().currentUser.id;
  const state = useChatStore.getState();
  saveChatSnapshot(me, {
    conversations: state.conversations.filter((room) => room.participantIds.includes(me)),
    messages: state.messages.map((message) => message.status !== 'sent' && message.media ? { ...message, media: { ...message.media, localPreviewUrl: undefined } } : message),
    users: useUserStore.getState().users,
  });
}

async function prepareAndSend(message: Message) {
  if (preparing.has(message.id)) return;
  preparing.add(message.id);
  const owner = useAuthStore.getState().currentUser.id;
  try {
    if (message.type === 'image' && !message.prepared) {
      const source = message.media?.localPreviewUrl;
      const fitted = source ? await prepareMedia(() => fitChatImage(source, useSettingsStore.getState().imageQuality)) : null;
      if (!fitted || !message.media) throw new Error('invalid_image');
      patchMessage(message.id, { media: { ...message.media, localPreviewUrl: fitted.url, fileSize: fitted.bytes, width: fitted.width, height: fitted.height } });
      if (message.media.localPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(message.media.localPreviewUrl);
    }     else if (message.type === 'file' && message.media && !message.media.localPreviewUrl?.startsWith('data:')) {
      if (!message.media.localPreviewUrl || message.media.fileSize > FILE_BYTES_MAX) throw new Error('file_too_large');
      const source = message.media.localPreviewUrl;
      const prepared = await prepareMedia(async () => {
        const blob = await fetch(source).then((response) => response.blob());
        if (blob.size > FILE_BYTES_MAX) throw new Error('file_too_large');
        return { size: blob.size, data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
      });
      patchMessage(message.id, { media: { ...message.media, fileSize: prepared.size, localPreviewUrl: `data:application/octet-stream;base64,${prepared.data}` } });
      if (message.media.localPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(message.media.localPreviewUrl);
    } else if (message.type === 'video' && message.media) {
      if (!message.media.localPreviewUrl || message.media.fileSize < 1 || message.media.fileSize > VIDEO_BYTES_MAX) throw new Error('file_too_large');
    }
    if (owner !== useAuthStore.getState().currentUser.id || !useAuthStore.getState().activated) return;
    const ready = useChatStore.getState().messages.find((item) => item.id === message.id);
    if (!ready) return;
    await saveOutgoing(owner, { ...ready, prepared: true });
    patchMessage(message.id, { prepared: true });
    persistChat();
    if (useNetworkStore.getState().network === 'offline' || ready.status === 'failed') return;
    patchMessage(message.id, { status: 'sending', prepared: true });
    if (serverText(ready)) await publishText(ready);
    else if (serverImage(ready)) await publishImage(ready);
    else if (serverFile(ready)) await publishFile(ready);
    else if (serverVideo(ready)) await publishVideo(ready);
    else throw new Error('unsupported_media');
    await removeOutgoing(owner, message.id);
  } catch (error) {
    if (owner !== useAuthStore.getState().currentUser.id) return;
    const current = useChatStore.getState().messages.find((item) => item.id === message.id);
    if (!current || current.status === 'sent' || error instanceof AdminApiError && error.code === 'cancelled') return;
    const temporary = error instanceof AdminApiError && retryableStatus(error.status) && error.code !== 'account_changed';
    const attempts = (current.sendAttempts ?? 0) + 1;
    const patch: Partial<Message> = { status: temporary && attempts < 5 ? 'pending' : 'failed', uploadProgress: undefined,
      retryable: temporary, sendAttempts: attempts, retryAt: temporary ? Date.now() + retryDelay(attempts, error instanceof AdminApiError ? error.retryAfter : 0) : undefined };
    patchMessage(message.id, patch);
    try { await saveOutgoing(owner, { ...current, ...patch }); } catch { useChatStore.setState({ lastError: 'تعذر حفظ الرسالة محليًا. تحقق من المساحة المتاحة ثم أعد المحاولة.' }); }
    if (!temporary) useChatStore.setState({ lastError: 'تعذر تجهيز أو إرسال الرسالة. تحقق من الملف أو صلاحية الوصول ثم أعد المحاولة.' });
  } finally {
    preparing.delete(message.id);
    outgoing.wake();
  }
}

async function syncRoom(conversationId: string, wait = false, signal?: AbortSignal): Promise<boolean> {
  const existing = roomSyncPending.get(conversationId); if (existing && !wait) return existing;
  const owner = useAuthStore.getState().currentUser.id;
  const promise = (async () => {
    try {
      // Bound one foreground drain; further pages continue on the next refresh.
      for (let page = 0; page < 10; page++) {
        const cursor = roomSyncCursors.get(conversationId);
        const params = new URLSearchParams();
        if (cursor) params.set('cursor', cursor);
        if (wait && page === 0) params.set('wait', '1');
        const payload = await adminFetch(`/api/rooms/${conversationId}/sync${params.size ? `?${params}` : ''}`, wait ? { hold: true, signal } : undefined);
        if (owner !== useAuthStore.getState().currentUser.id || !useAuthStore.getState().activated) return false;
        const delta = readRoomSync(payload, conversationId); if (!delta) return false;
        const opened = await openMessages(owner, delta.messages);
        if (owner !== useAuthStore.getState().currentUser.id || !useAuthStore.getState().activated) return false;
        const state = useChatStore.getState();
        const incoming = opened.map((message) => {
          const previous = state.messages.find((item) => item.id === message.id);
          return previous?.media?.localPreviewUrl && message.media && !message.deletedForEveryone
            ? { ...message, media: { ...message.media, localPreviewUrl: previous.media.localPreviewUrl, state: 'cached' as const } } : message;
        });
        const cursors = { ...(delta.reset ? {} : state.readCursors[conversationId]) };
        const times = { ...(delta.reset ? {} : state.readTimes[conversationId]) };
        for (const reader of delta.readers) { cursors[reader.userId] = reader.messageId; times[reader.userId] = reader.readAt; }
        useChatStore.setState({
          messages: delta.reset ? mergeRoomWindow(state.messages, incoming, conversationId, 'latest') : mergeRoomDelta(state.messages, incoming, delta.removedIds, conversationId),
          fullRooms: [...new Set([...state.fullRooms, conversationId])],
          roomHasMore: delta.reset ? { ...state.roomHasMore, [conversationId]: delta.historyHasMore } : state.roomHasMore,
          readCursors: { ...state.readCursors, [conversationId]: cursors }, readTimes: { ...state.readTimes, [conversationId]: times },
          conversations: state.conversations.map((room) => {
            const latest = [...state.messages.filter((message) => message.conversationId === conversationId && !incoming.some((row) => row.id === message.id)), ...incoming]
              .sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).at(-1);
            return room.id === conversationId && latest ? { ...room, lastMessageId: latest.id } : room;
          }),
        });
        for (const message of incoming) if (message.senderId === owner) void removeOutgoing(owner, message.id).catch(() => undefined);
        if (delta.typing) useChatStore.getState().setTyping(conversationId, delta.typing.filter((id) => id !== owner));
        roomSyncCursors.set(conversationId, delta.cursor);
        if (!delta.hasMore) return true;
      }
      return true;
    } catch { return false; }
  })().finally(() => { if (roomSyncPending.get(conversationId) === promise) roomSyncPending.delete(conversationId); });
  if (!wait) roomSyncPending.set(conversationId, promise);
  return promise;
}

function accountRoom(conversationId: string) {
  const me = useAuthStore.getState().currentUser.id;
  return isServerId(me) && conversationId === GLOBAL_CHAT_ID ? SERVER_GLOBAL_ROOM_ID : conversationId;
}

function placeLoadedRoom(conversations: Conversation[], conversationId: string, last?: Message) {
  const mapped = conversations.map((conversation) => (
    conversation.id === conversationId
      ? { ...conversation, unreadCount: 0, ...(last ? { lastMessageId: last.id } : {}) }
      : conversation
  ));
  if (mapped.some((conversation) => conversation.id === conversationId) || conversationId !== SERVER_GLOBAL_ROOM_ID) return mapped;
  const me = useAuthStore.getState().currentUser.id;
  return [
    {
      id: SERVER_GLOBAL_ROOM_ID,
      type: 'global' as const,
      name: 'ChatX',
      participantIds: isServerId(me) ? [me] : [],
      unreadCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      ...(last ? { lastMessageId: last.id } : {}),
    },
    ...mapped.filter((conversation) => conversation.id !== GLOBAL_CHAT_ID),
  ];
}

function outgoingStatus(): MessageStatus {
  return useNetworkStore.getState().network === 'offline' ? 'pending' : 'sending';
}

function takeReply(conversationId: string) {
  const pending = useChatStore.getState().replyingTo;
  if (!pending || pending.conversationId !== conversationId) return undefined;
  useChatStore.setState({ replyingTo: null });
  return pending.messageId;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: CONVERSATIONS,
  messages: MESSAGES,
  fullRooms: [],
  roomHasMore: {},
  lastError: '',
  typingByConversation: {},
  historyLimit: {},
  readCursors: SEED_READ_CURSORS,
  readTimes: SEED_READ_TIMES,
  inboxClearedAt: null,
  inboxReadIds: [],
  serverInbox: [],
  serverUnread: 0,
  inboxHasMore: false,
  editingId: null,
  replyingTo: null,
  beginReply: (messageId) => {
    const message = get().messages.find((item) => item.id === messageId);
    if (!message || message.deletedForEveryone) return;
    set({ replyingTo: { conversationId: message.conversationId, messageId }, editingId: null });
  },
  cancelReply: () => set({ replyingTo: null }),
  sendMessage: (conversationId, content) => {
    const text = content.trim();
    if (!text) return;
    const roomId = accountRoom(conversationId);
    const url = firstUrl(text);
    appendMessage({
      id: crypto.randomUUID(),
      conversationId: roomId,
      senderId: useAuthStore.getState().currentUser.id,
      type: 'text',
      text,
      status: outgoingStatus(),
      createdAt: new Date().toISOString(),
      link: url ? linkDraft(url) : undefined,
      replyToId: takeReply(roomId),
    });
  },
  sendImage: (conversationId, quality, picked) => {
    useSettingsStore.getState().setImageQuality(quality);
    const roomId = accountRoom(conversationId);
    const original = picked?.fileSize ?? ORIGINAL_IMAGE_SIZE;
    appendMessage({
      id: crypto.randomUUID(),
      conversationId: roomId,
      senderId: useAuthStore.getState().currentUser.id,
      type: 'image',
      status: outgoingStatus(),
      createdAt: new Date().toISOString(),
      replyToId: takeReply(roomId),
      media: {
        fileName: picked?.fileName ?? 'photo.jpg',
        fileSize: Math.min(original, expectedImageSize(quality)),
        localPreviewUrl: picked?.previewUrl,
        width: 1200,
        height: 800,
        state: 'cached',
      },
    });
  },
  sendVideo: (conversationId, quality, picked) => {
    const roomId = accountRoom(conversationId);
    if (isServerId(roomId)) {
      const saving = useSettingsStore.getState().dataSaver || useNetworkStore.getState().network !== 'online';
      const size = picked?.fileSize ?? 0;
      if (saving) {
        set({ lastError: 'لا يمكن إرسال فيديو أثناء توفير البيانات أو الاتصال الضعيف.' });
        return;
      }
      const tooBig = size < 1 || size > VIDEO_BYTES_MAX;
      if (tooBig) set({ lastError: 'الفيديو أكبر من 8 MB. اختر مقطعًا أقصر.' });
      appendMessage({
        id: crypto.randomUUID(),
        conversationId: roomId,
        senderId: useAuthStore.getState().currentUser.id,
        type: 'video',
        status: tooBig ? 'failed' : outgoingStatus(),
        createdAt: new Date().toISOString(),
        replyToId: takeReply(roomId),
        media: {
          fileName: picked?.fileName ?? 'video.mp4',
          fileSize: size,
          localPreviewUrl: picked?.previewUrl,
          state: 'cached',
        },
      });
      return;
    }
    useSettingsStore.getState().setVideoQuality(quality);
    const original = picked?.fileSize ?? ORIGINAL_VIDEO_SIZE;
    appendMessage({
      id: crypto.randomUUID(),
      conversationId,
      senderId: useAuthStore.getState().currentUser.id,
      type: 'video',
      status: outgoingStatus(),
      createdAt: new Date().toISOString(),
      replyToId: takeReply(conversationId),
      media: {
        fileName: picked?.fileName ?? 'video.mp4',
        fileSize: Math.min(original, expectedVideoSize(quality)),
        localPreviewUrl: picked?.previewUrl,
        duration: picked?.duration ?? 42,
        state: 'cached',
      },
    });
  },
  sendFile: (conversationId, picked) => {
    const roomId = accountRoom(conversationId);
    const tooBig = picked.fileSize > FILE_BYTES_MAX;
    appendMessage({
      id: crypto.randomUUID(),
      conversationId: roomId,
      senderId: useAuthStore.getState().currentUser.id,
      type: 'file',
      status: tooBig ? 'failed' : outgoingStatus(),
      createdAt: new Date().toISOString(),
      replyToId: takeReply(roomId),
      media: {
        fileName: picked.fileName,
        fileSize: picked.fileSize,
        localPreviewUrl: picked.previewUrl,
        state: 'cached',
      },
    });
  },
  sendLink: (conversationId, url) => {
    const clean = url.trim();
    if (!clean) return;
    const safe = clean.startsWith('http') ? clean : `https://${clean}`;
    if (!firstUrl(safe)) { set({ lastError: 'الرابط غير صالح.' }); return; }
    if (isServerId(accountRoom(conversationId))) { get().sendMessage(conversationId, safe); return; }
    appendMessage({
      id: crypto.randomUUID(),
      conversationId,
      senderId: useAuthStore.getState().currentUser.id,
      type: 'link',
      status: outgoingStatus(),
      createdAt: new Date().toISOString(),
      replyToId: takeReply(conversationId),
      link: {
        url: clean.startsWith('http') ? clean : `https://${clean}`,
        title: 'رابط مشارك',
        description: 'المعاينة لا تُحمّل إلا عند الطلب.',
        preview: 'notLoaded',
      },
    });
  },
  retryMessage: (messageId) => {
    const message = get().messages.find((item) => item.id === messageId);
    if (!message || message.status !== 'failed') return;
    const network = useNetworkStore.getState().network;
    patchMessage(messageId, { status: network === 'offline' ? 'pending' : 'sending', uploadProgress: undefined });
    if (network === 'offline') return;
    if (isServerId(message.conversationId)) { patchMessage(message.id, { status: 'pending', sendAttempts: 0, retryAt: undefined, retryable: false }); outgoing.wake(); }
    else scheduleDelivery(messageId);
  },
  cancelMessage: (messageId) => {
    clearTimers(messageId);
    patchMessage(messageId, { status: 'failed', retryable: false, retryAt: undefined, uploadProgress: undefined });
    const cancelled = get().messages.find((item) => item.id === messageId);
    if (cancelled && isServerId(cancelled.conversationId)) void saveOutgoing(useAuthStore.getState().currentUser.id, cancelled).catch(() => undefined);
  },
  downloadMedia: (messageId) => {
    const message = get().messages.find((item) => item.id === messageId);
    if (!message?.media || message.media.state === 'cached' || message.media.state === 'downloading') return;
    if (isServerId(message.conversationId) && message.type === 'image') {
      void pullServerImage(message);
      return;
    }
    if (isServerId(message.conversationId) && message.type === 'video') {
      void pullServerVideo(message);
      return;
    }
    if (isServerId(message.conversationId) && message.type === 'file') {
      void pullServerFile(message);
      return;
    }
    patchMessage(messageId, { downloadFailed: false, media: { ...message.media, state: 'downloading' }, downloadProgress: 0 });
    const step = useNetworkStore.getState().network === 'slow' ? 700 : 280;
    [25, 60, 100].forEach((progress, index) => {
      window.setTimeout(() => {
        const current = useChatStore.getState().messages.find((item) => item.id === messageId);
        if (!current?.media || current.media.state === 'remote') return;
        if (progress === 100) {
          patchMessage(messageId, {
            media: { ...current.media, state: 'cached' },
            downloadProgress: undefined,
            downloadFailed: false,
          });
          useSettingsStore.getState().addUsage(current.type === 'video' ? 'videos' : 'images', current.media.fileSize);
          return;
        }
        patchMessage(messageId, { downloadProgress: progress });
      }, step * (index + 1));
    });
  },
  loadLinkPreview: (messageId) => {
    const message = get().messages.find((item) => item.id === messageId);
    if (!message?.link || message.link.preview !== 'notLoaded' || useNetworkStore.getState().network === 'offline') return;
    const url = message.link.url;
    patchMessage(messageId, { link: { ...message.link, preview: 'loading' } });
    void adminFetch(`/api/links/preview?url=${encodeURIComponent(url)}`, { hold: true }).then((payload) => {
      const current = useChatStore.getState().messages.find((item) => item.id === messageId);
      if (!current?.link || current.link.url !== url) return;
      const card = readPreviewPayload(payload);
      patchMessage(messageId, {
        link: {
          ...current.link,
          preview: 'loaded',
          title: card?.title || current.link.title || siteHost(url),
          description: card?.description || '',
          image: card?.image || undefined,
        },
      });
    }).catch(() => {
      const current = useChatStore.getState().messages.find((item) => item.id === messageId);
      if (!current?.link || current.link.url !== url) return;
      patchMessage(messageId, { link: { ...current.link, preview: 'loaded', title: current.link.title || siteHost(url) } });
    });
  },
  revealMessage: (conversationId, messageId) => {
    const mine = get()
      .messages.filter((message) => message.conversationId === conversationId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const index = mine.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    const needed = mine.length - index;
    const limit = get().historyLimit[conversationId] ?? PAGE_SIZE;
    if (needed <= limit) return;
    set((state) => ({ historyLimit: { ...state.historyLimit, [conversationId]: needed } }));
  },
  loadOlder: async (conversationId) => {
    const count = get().messages.filter((message) => message.conversationId === conversationId).length;
    const limit = get().historyLimit[conversationId] ?? PAGE_SIZE;
    if (isServerId(conversationId) && count <= limit) {
      const oldest = get().messages.filter((message) => message.conversationId === conversationId && message.status === 'sent')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];
      if (!oldest || get().roomHasMore[conversationId] === false) return true;
      if (!await get().loadRoom(conversationId, { beforeId: oldest.id })) return false;
    } else if (count <= limit) return true;
    set((state) => ({ historyLimit: { ...state.historyLimit, [conversationId]: Math.min(300, limit + PAGE_SIZE) } }));
    return true;
  },
  markRead: async (conversationId, messageId) => {
    const current = get().conversations.find((conversation) => conversation.id === conversationId);
    if (!current) return false;
    if (isServerId(conversationId)) {
      if (!messageId) return true;
      const owner = useAuthStore.getState().currentUser.id;
      const previous = get().messages.find((item) => item.id === get().readCursors[conversationId]?.[owner]);
      const target = get().messages.find((item) => item.id === messageId && item.conversationId === conversationId);
      if (!target) return false;
      const noticeAt = get().serverInbox.filter(item => item.id === messageId && item.conversationId === conversationId)
        .reduce((latest, item) => item.createdAt > latest ? item.createdAt : latest, target.createdAt);
      if (get().serverInbox.some(item => item.id === messageId && item.conversationId === conversationId && item.unread)) get().markNotificationsRead([messageId]);
      if (previous && (previous.createdAt > target.createdAt || (previous.createdAt === target.createdAt && previous.id > target.id))) return true;
      const same = previous?.id === messageId;
      const stale = same && get().serverInbox.some((item) => item.unread && item.kind !== 'reaction' && item.conversationId === conversationId
        && (item.createdAt < target.createdAt || (item.createdAt === target.createdAt && item.id <= messageId)));
      if (same && !stale) return true;
      try {
        queueRoomRead(owner, conversationId, messageId, target.createdAt);
        if (!same) queueNotificationReads(owner, [messageId], undefined, { [messageId]: noticeAt });
      }
      catch { set({ lastError: 'تعذر حفظ القراءة على الجهاز.' }); return false; }
      inboxReadVersion++;
      set((state) => {
        const serverInbox = overlayPendingReads(owner, state.serverInbox);
        const read = state.serverInbox.filter((item) => item.unread).length - serverInbox.filter((item) => item.unread).length;
        const listed = state.serverInbox.some((item) => item.id === messageId && item.kind !== 'reaction');
        const extra = !same && target.senderId !== owner && !listed ? 1 : 0;
        return { serverInbox, serverUnread: Math.max(0, state.serverUnread - read - extra) };
      });
      cacheInbox(owner, get().serverInbox, get().serverUnread);
      void get().loadInbox();
      await syncPendingReadWrites();
      return !pendingReads(owner).rooms[conversationId];
    }
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
      ),
    }));
    return true;
  },
  markAllRead: () => {
    const owner = useAuthStore.getState().currentUser.id;
    if (isServerId(owner)) {
      try { queueNotificationReads(owner, [], get().serverInbox.reduce((latest, item) => item.createdAt > latest ? item.createdAt : latest, '') || new Date(serverNow()).toISOString()); }
      catch { set({ lastError: 'تعذر حفظ القراءة على الجهاز. حاول مجددًا.' }); return; }
    }
    inboxReadVersion++;
    set((state) => {
      const inboxReadIds = isServerId(owner)
        ? state.inboxReadIds
        : noticedReactions(state.inboxReadIds, state.messages, owner);
      return {
        inboxReadIds,
        serverInbox: state.serverInbox.map((item) => ({ ...item, unread: false, unreadCount: 0 })),
        serverUnread: 0,
        conversations: state.conversations.map((conversation) =>
          isServerId(owner) || conversation.type === 'private' || conversation.unreadCount === 0
            ? conversation
            : { ...conversation, unreadCount: 0 },
        ),
      };
    });
    if (isServerId(owner)) { cacheInbox(owner, get().serverInbox, get().serverUnread); void syncPendingReadWrites(); }
  },
  markNotificationsRead: (ids) => {
    if (ids.length === 0) return;
    const owner = useAuthStore.getState().currentUser.id;
    if (isServerId(owner)) {
        try { queueNotificationReads(owner, ids, undefined, Object.fromEntries(ids.map(id => [id, get().serverInbox.find(item => item.id === id)?.createdAt ?? new Date(serverNow()).toISOString()]))); }
      catch { set({ lastError: 'تعذر حفظ القراءة على الجهاز. حاول مجددًا.' }); return; }
    }
    inboxReadVersion++;
    set((state) => {
      const known = new Set(state.inboxReadIds);
      let changed = false;
      ids.forEach((id) => {
        if (!known.has(id)) {
          known.add(id);
          changed = true;
        }
      });
      const hit = state.serverInbox.filter((item) => ids.includes(item.id) && item.unread).length;
      const serverInbox = state.serverInbox.map((item) => ids.includes(item.id) ? { ...item, unread: false, unreadCount: 0 } : item);
      if (!changed && hit === 0 && serverInbox.every((item, index) => item === state.serverInbox[index])) return state;
      return { inboxReadIds: [...known], serverInbox, serverUnread: Math.max(0, state.serverUnread - hit) };
    });
    if (isServerId(owner)) { cacheInbox(owner, get().serverInbox, get().serverUnread); void syncPendingReadWrites(); }
  },
  clearInbox: () => {
    const owner = useAuthStore.getState().currentUser.id;
    if (isServerId(owner)) {
      try { queueInboxClear(owner, get().serverInbox.reduce((latest, item) => item.createdAt > latest ? item.createdAt : latest, '') || new Date(serverNow()).toISOString()); }
      catch { set({ lastError: 'تعذر حفظ الإجراء على الجهاز. حاول مجددًا.' }); return; }
    }
    inboxReadVersion++;
    set((state) => ({
      inboxClearedAt: new Date().toISOString(),
      serverInbox: [],
      serverUnread: 0,
      inboxHasMore: false,
      conversations: state.conversations.map((conversation) =>
        isServerId(owner) || conversation.type === 'private' || conversation.unreadCount === 0
          ? conversation
          : { ...conversation, unreadCount: 0 },
      ),
    }));
    if (isServerId(owner)) { cacheInbox(owner, [], 0); void syncPendingReadWrites(); }
  },
  setTyping: (conversationId, userIds) => {
    const current = get().typingByConversation[conversationId] ?? [];
    if (current.length === userIds.length && current.every((userId, index) => userId === userIds[index])) return;
    set((state) => ({
      typingByConversation: { ...state.typingByConversation, [conversationId]: userIds },
    }));
  },
  openPrivate: async (userId) => {
    const currentUserId = useAuthStore.getState().currentUser.id;
    if (userId === currentUserId) {
      const mine = get().conversations.find((conversation) => conversation.self);
      if (mine) return mine.id;
    }
    const existing = get().conversations.find((conversation) => isPrivateBetween(conversation, currentUserId, userId));
    if (existing) return existing.id;
    if (isServerId(currentUserId)) {
      if (!isServerId(userId)) return '';
      try {
        const opened = readOpenedRoom(await adminFetch('/api/rooms', { method: 'POST', body: { kind: 'private', userId } }));
        if (!opened || opened.conversation.type !== 'private') return '';
        if (userId === currentUserId && !opened.conversation.self) return '';
        rememberPeople(opened.users);
        rememberConversation(opened.conversation);
        return opened.conversation.id;
      } catch {
        return '';
      }
    }
    const other = useUserStore.getState().users.find((user) => user.id === userId);
    if (!other) return '';
    if (other.id === currentUserId) {
      const conversation: Conversation = {
        id: crypto.randomUUID(),
        type: 'private',
        self: true,
        participantIds: [currentUserId],
        unreadCount: 0,
        createdAt: new Date().toISOString(),
      };
      set((state) => ({ conversations: [conversation, ...state.conversations] }));
      return conversation.id;
    }
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      type: 'private',
      participantIds: [currentUserId, other.id],
      unreadCount: 0,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ conversations: [conversation, ...state.conversations] }));
    return conversation.id;
  },
  createGroup: async (name, memberIds) => {
    const currentUserId = useAuthStore.getState().currentUser.id;
    const title = name.trim();
    if (!title || memberIds.length < 2) return '';
    if (isServerId(currentUserId)) {
      const people = [...new Set(memberIds)].filter((id) => isServerId(id) && id !== currentUserId);
      if (people.length < 2) return '';
      try {
        const opened = readOpenedRoom(await adminFetch('/api/rooms', { method: 'POST', body: { kind: 'group', name: title, memberIds: people } }));
        if (!opened || opened.conversation.type !== 'group') return '';
        rememberPeople(opened.users);
        rememberConversation(opened.conversation);
        return opened.conversation.id;
      } catch {
        return '';
      }
    }
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      type: 'group',
      name: title,
      participantIds: [...new Set([currentUserId, ...memberIds])],
      adminId: currentUserId,
      unreadCount: 0,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ conversations: [conversation, ...state.conversations] }));
    return conversation.id;
  },
  updateGroup: async (conversationId, patch) => {
    const current = get().conversations.find((item) => item.id === conversationId);
    const name = patch.name?.trim();
    if (isServerId(conversationId)) {
      const body: { name?: string; bio?: string; avatar?: string; banner?: string | null } = {};
      if (name && name !== current?.name) body.name = name;
      if (patch.bio !== undefined && patch.bio.trim() !== (current?.bio ?? '')) body.bio = patch.bio.trim();
      if (patch.avatarUrl) body.avatar = patch.avatarUrl;
      if (patch.bannerUrl) body.banner = patch.bannerUrl;
      else if (patch.bannerUrl === null && current?.bannerUrl) body.banner = null;
      if (!body.name && body.bio === undefined && !body.avatar && body.banner === undefined) return true;
      try {
        const updated = readUpdatedRoom(await adminFetch(`/api/rooms/${conversationId}`, { method: 'PATCH', body }));
        if (!updated) throw new Error('bad');
        const owner = useAuthStore.getState().currentUser.id;
        const saved = { ...updated, message: updated.message ? (await openMessages(owner, [updated.message]))[0] : undefined };
        set((state) => ({
          lastError: '',
          conversations: state.conversations.some((item) => item.id === saved.conversation.id)
            ? state.conversations.map((item) => {
                if (item.id !== saved.conversation.id) return item;
                const next = { ...item, ...saved.conversation, unreadCount: item.unreadCount };
                if (patch.bannerUrl === null && !saved.conversation.bannerUrl) delete next.bannerUrl;
                return next;
              })
            : [saved.conversation, ...state.conversations],
          messages: saved.message && !state.messages.some((item) => item.id === saved.message?.id)
            ? [...state.messages, saved.message]
            : state.messages,
        }));
        return true;
      } catch {
        set({ lastError: 'تعذر حفظ المجموعة.' });
        return false;
      }
    }
    const line = localGroupLine(useAuthStore.getState().currentUser.displayName, { name, avatarUrl: patch.avatarUrl, bannerUrl: patch.bannerUrl });
    const allowed = Boolean(current && (current.type === 'group' || current.type === 'global') && canEditRoom(useAuthStore.getState().currentUser, current));
    set((state) => ({
      conversations: state.conversations.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        if (conversation.type !== 'group' && conversation.type !== 'global') return conversation;
        if (!canEditRoom(useAuthStore.getState().currentUser, conversation)) return conversation;
        const next = {
          ...conversation,
          ...(name ? { name } : {}),
          ...(patch.bio !== undefined ? { bio: patch.bio.trim() } : {}),
          ...(patch.avatarUrl ? { avatarUrl: patch.avatarUrl } : {}),
          ...(patch.bannerUrl ? { bannerUrl: patch.bannerUrl } : {}),
        };
        if (patch.bannerUrl === null) delete next.bannerUrl;
        return next;
      }),
      messages: allowed && line
        ? [...state.messages, {
            id: crypto.randomUUID(),
            conversationId,
            senderId: useAuthStore.getState().currentUser.id,
            type: 'text' as const,
            text: line,
            status: 'sent' as const,
            createdAt: new Date().toISOString(),
            event: true,
          }]
        : state.messages,
    }));
    return allowed;
  },
  pauseOutgoing: () => {
    for (const id of timers.keys()) clearTimers(id);
    set((state) => ({
      messages: state.messages.map((message) =>
        message.status === 'sending' ? { ...message, status: 'pending', uploadProgress: undefined } : message,
      ),
    }));
  },
  flushOutgoing: () => {
    set((state) => ({ messages: state.messages.map((message) => message.status === 'failed' && message.retryable
      ? { ...message, status: 'pending', sendAttempts: 0, retryAt: undefined } : message) }));
    outgoing.wake();
    for (const message of get().messages) if (!isServerId(message.conversationId) && message.status === 'pending') scheduleDelivery(message.id);
  },
  loadInbox: async (before) => {
    const me = useAuthStore.getState().currentUser.id;
    if (!isServerId(me)) return 'local';
    await syncPendingReadWrites();
    const readVersion = inboxReadVersion;
    const query = before ? `?before=${encodeURIComponent(before.at)}&beforeId=${encodeURIComponent(before.id)}` : '';
    try {
      const payload = await adminFetch(`/api/notifications${query}`);
      if (me !== useAuthStore.getState().currentUser.id || !useAuthStore.getState().activated) return 'invalid';
      if (readVersion !== inboxReadVersion) return 'ok';
      const parsed = readInboxPayload(payload);
      const unread = readInboxUnread(payload);
      if (!parsed || unread === null) return 'invalid';
      const items = await Promise.all(parsed.map(async ({ sealed, ...item }) => {
        const plain = sealed ? await openPreview(me, item.conversationId, item.id, sealed) : null;
        return plain ? { ...item, preview: notificationPreview(plain) } : item;
      }));
      if (me !== useAuthStore.getState().currentUser.id || !useAuthStore.getState().activated || readVersion !== inboxReadVersion) return 'ok';
        const overlaid = overlayPendingReads(me, items);
        const pending = pendingReads(me);
        const cutoff = [pending.allUntil, pending.clearedUntil].filter(Boolean).sort().at(-1);
        const allCovered = !before && cutoff && items.every(item => item.createdAt <= cutoff);
        set((state) => ({
          serverInbox: mergeInbox(state.serverInbox, overlaid, Boolean(before)),
          serverUnread: before ? state.serverUnread : allCovered ? 0 : Math.max(0, unread - items.filter(item => item.unread && !overlaid.some(row => row.id === item.id && row.kind === item.kind && row.unread)).length),
        inboxHasMore: items.length === NOTIFICATIONS_PAGE_SIZE,
      }));
      cacheInbox(me, get().serverInbox, get().serverUnread);
      return 'ok';
    } catch (error) {
      const offline = !(error instanceof AdminApiError) || error.code === 'offline' || error.code === 'unavailable';
      return offline ? 'offline' : 'invalid';
    }
  },
  loadGroupTurn: async (conversationId) => {
    const me = useAuthStore.getState().currentUser.id;
    if (!isServerId(me) || !isServerId(conversationId)) return 'local';
    try {
      if (!get().conversations.some((room) => room.id === conversationId)) await get().loadHome();
      const turn = readGroupTurnPayload(await adminFetch(`/api/rooms/${conversationId}/turn`), conversationId);
      if (!turn || me !== useAuthStore.getState().currentUser.id || !useAuthStore.getState().activated) return 'invalid';
      syncServerClock(turn.serverTime, true);
      const users = useUserStore.getState();
      if (users.users.some((user) => user.id === turn.holder.id)) {
        const { status, ...profile } = turn.holder;
        users.updateUser(turn.holder.id, profile);
      } else users.addUser(turn.holder);
      set((state) => ({ conversations: state.conversations.map((room) => room.id === conversationId
        ? { ...room, turnUserId: turn.turnUserId, turnOpensAt: turn.turnOpensAt, participantIds: turn.participantIds } : room) }));
      return 'ok';
    } catch (error) {
      const offline = !(error instanceof AdminApiError) || error.code === 'offline' || error.code === 'unavailable';
      return offline ? 'offline' : 'invalid';
    }
  },
  dismissDeletedChat: async (conversationId) => {
    const me = useAuthStore.getState().currentUser.id;
    const room = get().conversations.find((item) => item.id === conversationId);
    if (!room || !deletedPrivatePeer(room, me, useUserStore.getState().users)) return false;
    if (isServerId(me)) {
      try {
        await adminFetch(`/api/rooms/${conversationId}`, { method: 'DELETE' });
      } catch {
        return false;
      }
    }
    set((state) => ({
      conversations: state.conversations.filter((item) => item.id !== conversationId),
      messages: state.messages.filter((item) => item.conversationId !== conversationId),
      fullRooms: state.fullRooms.filter((id) => id !== conversationId),
    }));
    return true;
  },
  loadHome: async () => {
    const me = useAuthStore.getState().currentUser.id;
    if (!isServerId(me)) return 'local';
    try {
      const parsed = readHomePayload(await adminFetch('/api/home'));
      if (me !== useAuthStore.getState().currentUser.id || !useAuthStore.getState().activated) return 'invalid';
      if (!parsed) return 'invalid';
      const home = { ...parsed, messages: await openMessages(me, parsed.messages) };
      if (me !== useAuthStore.getState().currentUser.id || !useAuthStore.getState().activated) return 'invalid';
      const users = useUserStore.getState();
      for (const user of home.users) {
        if (users.users.some((item) => item.id === user.id)) {
          const { status, ...profile } = user;
          users.updateUser(user.id, profile);
        } else users.addUser(user);
      }
      set((state) => ({
        conversations: home.conversations.map((room) => preserveCurrentTurn(room, state.conversations.find((current) => current.id === room.id))),
        messages: mergeHomeMessages(
          state.messages,
          home.messages,
          home.conversations.map((conversation) => conversation.id),
          state.fullRooms,
        ),
      }));
      return 'ok';
    } catch (error) {
      const offline = !(error instanceof AdminApiError) || error.code === 'offline' || error.code === 'unavailable';
      return offline ? 'offline' : 'invalid';
    }
  },
  loadRoom: async (conversationId, page) => {
    if (!isServerId(conversationId)) return true;
    const me = useAuthStore.getState().currentUser.id;
    // Opening a room also hands its keys to members who set up encryption since.
    if (!page?.wait && isServerId(me)) void ensureRoomKey(me, conversationId, roomMembers(conversationId)).catch(() => undefined);
    if (!page?.beforeId && !page?.aroundId) return syncRoom(conversationId, page?.wait === true, page?.signal);
    const owner = useAuthStore.getState().currentUser.id;
    try {
      const params = new URLSearchParams();
      if (page?.beforeId) params.set('beforeId', page.beforeId);
      if (page?.aroundId) params.set('aroundId', page.aroundId);
      const [payload, latestPayload] = await Promise.all([
        adminFetch(`/api/rooms/${conversationId}/messages${params.size ? `?${params}` : ''}`),
        page?.aroundId ? adminFetch(`/api/rooms/${conversationId}/messages`).catch(() => null) : null,
      ]);
      if (owner !== useAuthStore.getState().currentUser.id) return false;
      const parsed = readRoomMessages(payload, conversationId);
      if (!parsed) {
        return false;
      }
      const opened = await openMessages(owner, parsed);
      const latestParsed = latestPayload ? readRoomMessages(latestPayload, conversationId) : null;
      const latest = latestParsed ? await openMessages(owner, latestParsed) : [];
      const byId = new Map(opened.map((message) => [message.id, message]));
      for (const message of latest) if (!byId.has(message.id)) byId.set(message.id, message);
      const remote = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      if (owner !== useAuthStore.getState().currentUser.id) return false;
      const previews = new Map(
        get().messages.flatMap((item) => (
          item.conversationId === conversationId && (item.type === 'image' || item.type === 'file') && item.media?.localPreviewUrl
            ? [[item.id, item.media.localPreviewUrl] as const]
            : []
        )),
      );
      const shown = remote.map((item) => {
        const preview = previews.get(item.id);
        if (!preview || item.deletedForEveryone || (item.type !== 'image' && item.type !== 'file') || !item.media) return item;
        return { ...item, media: { ...item.media, localPreviewUrl: preview, state: 'cached' as const } };
      });
      const pending = get().messages.filter((message) => (
        message.conversationId === conversationId
        && (message.status === 'pending' || message.status === 'sending' || message.status === 'failed')
        && !shown.some((item) => item.id === message.id)
      ));
      const last = [...shown, ...pending].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
      const cursors: Record<string, string> = {};
      const times: Record<string, string> = {};
      for (const reader of readRoomReaders(payload)) {
        cursors[reader.userId] = reader.messageId;
        times[reader.userId] = reader.readAt;
      }
      set((state) => {
        const merged = mergeRoomWindow(state.messages, shown, conversationId, page?.beforeId ? 'older' : page?.aroundId ? 'around' : 'latest');
        const keptIds = new Set(merged.map((item) => item.id));
        releaseMedia(state.messages.filter((item) => !keptIds.has(item.id)));
        return {
        fullRooms: state.fullRooms.includes(conversationId) ? state.fullRooms : [...state.fullRooms, conversationId],
        messages: merged,
        roomHasMore: page?.beforeId || page?.aroundId || state.roomHasMore[conversationId] === undefined
          ? { ...state.roomHasMore, [conversationId]: Boolean((payload as { hasMore?: unknown }).hasMore) } : state.roomHasMore,
        conversations: state.conversations.map((conversation) => conversation.id === conversationId && !page && last ? { ...conversation, lastMessageId: last.id } : conversation),
        readCursors: { ...state.readCursors, [conversationId]: cursors },
        readTimes: { ...state.readTimes, [conversationId]: times },
        };
      });
      if (page?.aroundId) get().revealMessage(conversationId, page.aroundId);
      return true;
    } catch {
      if (owner === useAuthStore.getState().currentUser.id) set({ lastError: 'تعذر تحميل الرسائل. تحقق من الاتصال ثم أعد المحاولة.' });
      return false;
    }
  },
  resetMediaCache: () => {
    void clearReceivedMedia(useAuthStore.getState().currentUser.id).catch(() => undefined);
    releaseMedia(get().messages.filter((message) => message.status === 'sent'));
    set((state) => ({
      messages: state.messages.map((message) =>
        message.media && message.status === 'sent' ? { ...message, media: { ...message.media, localPreviewUrl: undefined, state: 'remote' }, downloadProgress: undefined } : message,
      ),
    }));
  },
  beginEdit: (messageId) => {
    const me = useAuthStore.getState().currentUser.id;
    const message = get().messages.find((item) => item.id === messageId);
    if (!message || message.senderId !== me || message.deletedForEveryone || message.event || message.locked) return;
    if (message.type !== 'text' && message.type !== 'link') return;
    set({ editingId: messageId, replyingTo: null });
  },
  cancelEdit: () => set({ editingId: null }),
  editMessage: async (messageId, content) => {
    const me = useAuthStore.getState().currentUser.id;
    const message = get().messages.find((item) => item.id === messageId);
    const text = content.trim();
    if (!message || !text || message.senderId !== me || message.deletedForEveryone || message.event) return false;
    if (message.type !== 'text' && message.type !== 'link') return false;
    const url = firstUrl(text);
    if (isServerId(message.conversationId)) {
      try {
        const clean = cleanText(text);
        if (!clean) return false;
        const sealed = await sealMessageText(me, message.conversationId, message.id, clean, roomMembers(message.conversationId));
        await adminFetch(`/api/rooms/${message.conversationId}/messages/${message.id}`, { method: 'PATCH', body: { text: sealed } });
        if (me !== useAuthStore.getState().currentUser.id || !useAuthStore.getState().activated) return false;
        patchMessage(messageId, { text, type: 'text', link: url ? linkDraft(url) : undefined, editedAt: new Date().toISOString() });
        if (get().editingId === messageId) set({ editingId: null });
        return true;
      } catch {
        if (me === useAuthStore.getState().currentUser.id) set({ lastError: 'تعذر تعديل الرسالة. أعد المحاولة.' });
        return false;
      }
    }
    patchMessage(messageId, {
      text,
      type: url ? 'link' : 'text',
      link: url ? linkDraft(url) : undefined,
      editedAt: new Date().toISOString(),
    });
    if (get().editingId === messageId) set({ editingId: null });
    return true;
  },
  deleteForEveryone: (messageId) => {
    const me = useAuthStore.getState().currentUser.id;
    const message = get().messages.find((item) => item.id === messageId);
    if (!message || message.senderId !== me || message.deletedForEveryone || message.event) return;
    if (isServerId(message.conversationId)) {
      void adminFetch(`/api/rooms/${message.conversationId}/messages/${message.id}`, { method: 'DELETE' }).then(() => {
        releaseMedia([message]);
        patchMessage(messageId, { status: 'sent', deletedForEveryone: true, text: undefined, media: undefined, link: undefined, reactions: undefined });
      }).catch((error) => {
        if (me !== useAuthStore.getState().currentUser.id) return;
        if (message.status !== 'sent' && error instanceof AdminApiError && error.status === 404) {
          releaseMedia([message]);
          set((state) => ({ messages: state.messages.filter((item) => item.id !== messageId) }));
          try { persistChat(); } catch { set({ lastError: 'تعذر حفظ حذف الرسالة محليًا.' }); }
        } else set({ lastError: 'تعذر حذف الرسالة من الخادم. أعد المحاولة.' });
      });
      return;
    }
    clearTimers(messageId);
    clearReadTimers(messageId);
    patchMessage(messageId, {
      deletedForEveryone: true,
      text: undefined,
      media: undefined,
      link: undefined,
      reactions: undefined,
      uploadProgress: undefined,
      downloadProgress: undefined,
      status: 'sent',
    });
    if (get().editingId === messageId) set({ editingId: null });
  },
  toggleReaction: (messageId, emoji) => {
    const me = useAuthStore.getState().currentUser.id;
    const message = get().messages.find((item) => item.id === messageId);
    if (!message || message.deletedForEveryone || message.event || !emoji.trim()) return;
    const previous = message.reactions;
    const next = applyReaction(previous, me, emoji);
    patchMessage(messageId, { reactions: next });
    if (!isServerId(message.conversationId) || !isServerId(message.id)) return;
    const mine = next.find((item) => item.userId === me);
    void adminFetch(`/api/rooms/${message.conversationId}/messages/${message.id}/reaction`, {
      method: 'POST',
      body: { emoji: mine?.emoji ?? '' },
    }).catch(() => {
      patchMessage(messageId, { reactions: previous });
    });
  },
  forgetUser: (userId) => {
    const me = useAuthStore.getState().currentUser.id;
    if (!userId || userId === me) return;
    set((state) => {
      const removed = new Set(
        state.conversations
          .filter((conversation) => conversation.type === 'private' && conversation.participantIds.includes(userId))
          .map((conversation) => conversation.id),
      );
      const typingByConversation = Object.fromEntries(
        Object.entries(state.typingByConversation).map(([id, ids]) => [id, ids.filter((item) => item !== userId)]),
      );
      return {
        conversations: state.conversations
          .filter((conversation) => !removed.has(conversation.id))
          .map((conversation) => ({
            ...conversation,
            participantIds: conversation.participantIds.filter((id) => id !== userId),
          })),
        messages: state.messages.filter((message) => !removed.has(message.conversationId)),
        typingByConversation,
      };
    });
  },
}));

let readRetryTimer: number | undefined;
let readRetryAttempts = 0;
let readRetryAt = 0;
let readServerRetryAt = 0;
let readSyncPending: Promise<void> | undefined;
let readSyncOwner: string | undefined;
let inboxReadVersion = 0;
async function syncPendingReadWrites() {
  const owner = useAuthStore.getState().currentUser.id;
  if (!isServerId(owner) || !useAuthStore.getState().activated || useNetworkStore.getState().network === 'offline' || navigator.onLine === false) return;
  if (readSyncPending && readSyncOwner === owner) return readSyncPending;
  if (Date.now() < readRetryAt) return;
  readSyncOwner = owner;
  window.clearTimeout(readRetryTimer);
  readSyncPending = flushPendingReads(owner, () => owner === useAuthStore.getState().currentUser.id && useAuthStore.getState().activated && useNetworkStore.getState().network !== 'offline' && navigator.onLine !== false,
    async (path, body) => {
      const version = inboxReadVersion;
      const result = await adminFetch(path, { method: 'POST', body });
      if (owner !== useAuthStore.getState().currentUser.id) return result;
      const queued = pendingReads(owner);
      const sent = body as { ids?: string[]; all?: boolean; until?: string; messageId?: string };
      const roomId = path.includes('/rooms/') ? path.split('/')[3] : undefined;
      // Intermediate acknowledgements still count other locally read items as
      // unread on the server. Apply its global badge only after the final intent.
      const countsCurrent = version === inboxReadVersion && !queued.clearUntil
        && (sent.all ? queued.allUntil === sent.until : !queued.allUntil)
        && queued.ids.every(id => sent.ids?.includes(id))
        && Object.entries(queued.rooms).every(([id, message]) => id === roomId && message === sent.messageId);
      inboxReadVersion++;
      if (path === '/api/notifications/read' && countsCurrent && typeof (result as { unreadCount?: unknown }).unreadCount === 'number') useChatStore.setState({ serverUnread: (result as { unreadCount: number }).unreadCount });
      if (path.includes('/rooms/')) {
        const roomId = path.split('/')[3]; const messageId = (body as {messageId:string}).messageId;
        const counts = result as { unreadCount?: number; unreadNotifications?: number };
        const target = useChatStore.getState().messages.find(item => item.id === messageId);
        useChatStore.setState(state => ({
          readCursors: { ...state.readCursors, [roomId]: { ...state.readCursors[roomId], [owner]: messageId } },
          conversations: state.conversations.map(room => room.id === roomId && typeof counts.unreadCount === 'number' ? { ...room, unreadCount: counts.unreadCount } : room),
          serverUnread: countsCurrent && typeof counts.unreadNotifications === 'number' ? counts.unreadNotifications : state.serverUnread,
          serverInbox: state.serverInbox.map(item => item.conversationId === roomId && item.kind !== 'reaction' && target && (item.createdAt < target.createdAt || item.createdAt === target.createdAt && item.id <= messageId) ? { ...item, unread: false, unreadCount: 0 } : item),
        }));
      }
      cacheInbox(owner, useChatStore.getState().serverInbox, useChatStore.getState().serverUnread);
      return result;
    }).then(() => { readRetryAttempts = 0; readRetryAt = 0; readServerRetryAt = 0; }).catch(error => {
      if (owner !== useAuthStore.getState().currentUser.id) return;
      if (error instanceof AdminApiError && !retryableStatus(error.status)) return;
      const wait = retryDelay(++readRetryAttempts, error instanceof AdminApiError ? error.retryAfter : 0);
      readRetryAt = Date.now() + wait;
      readServerRetryAt = error instanceof AdminApiError ? Date.now() + error.retryAfter : 0;
      readRetryTimer = window.setTimeout(syncPendingReadWrites, wait);
    }).finally(() => { if (readSyncOwner === owner) readSyncPending = undefined; });
  return readSyncPending;
}

useNetworkStore.subscribe((state, previous) => {
  if (state.network === previous.network) return;
  if (state.network !== 'offline') { readRetryAt = readServerRetryAt; void syncPendingReadWrites(); }
  if (state.network === 'offline') useChatStore.getState().pauseOutgoing();
  else if (previous.network === 'offline') useChatStore.getState().flushOutgoing();
  else outgoing.wake();
});

let cacheTimer: number | undefined;
function switchChatAccount() {
  window.clearTimeout(readRetryTimer); readRetryAttempts = 0; readRetryAt = 0; readServerRetryAt = 0;
  outgoingReady = false;
  roomSyncCursors.clear(); roomSyncPending.clear();
  window.clearTimeout(cacheTimer);
  for (const id of timers.keys()) clearTimers(id);
  for (const id of readTimers.keys()) clearReadTimers(id);
  releaseMedia(useChatStore.getState().messages);
  const auth = useAuthStore.getState();
  const snapshot = auth.activated ? loadChatSnapshot(auth.currentUser.id) : null;
  const demo = auth.activated && !isServerId(auth.currentUser.id);
  useChatStore.setState({
    conversations: snapshot?.conversations ?? (demo ? CONVERSATIONS : []),
    messages: snapshot?.messages ?? (demo ? MESSAGES : []),
    fullRooms: snapshot?.conversations.map((room) => room.id) ?? [],
    roomHasMore: {}, historyLimit: {}, readCursors: {}, readTimes: {}, typingByConversation: {},
    serverInbox: auth.activated ? overlayPendingReads(auth.currentUser.id, pendingReads(auth.currentUser.id).inbox ?? []) : [], serverUnread: auth.activated ? pendingReads(auth.currentUser.id).unread ?? 0 : 0, inboxHasMore: false, inboxReadIds: [], inboxClearedAt: null,
    editingId: null, replyingTo: null, lastError: '',
  });
  useUserStore.setState({ users: snapshot?.users ?? [auth.currentUser] });
  if (auth.activated) void loadOutgoing(auth.currentUser.id).then((durable) => {
    if (useAuthStore.getState().currentUser.id !== auth.currentUser.id || !useAuthStore.getState().activated) return;
    useChatStore.setState((state) => {
      const confirmed = new Set(state.messages.filter((message) => message.status === 'sent').map((message) => message.id));
      const queued = durable.filter((message) => !confirmed.has(message.id));
      for (const message of durable) if (confirmed.has(message.id)) void removeOutgoing(auth.currentUser.id, message.id).catch(() => undefined);
      return { messages: [...state.messages.filter((message) => !queued.some((row) => row.id === message.id)), ...queued] };
    });
    outgoingReady = true;
    useChatStore.getState().flushOutgoing();
  }).catch(() => {
    if (useAuthStore.getState().currentUser.id !== auth.currentUser.id || !useAuthStore.getState().activated) return;
    useChatStore.setState({ lastError: 'تعذر فتح التخزين المحلي. الرسائل الجديدة لن تُرسل حتى يمكن حفظها.' });
  });
}

const outgoing = createOutgoingScheduler({
  pending: () => useChatStore.getState().messages.filter((message) => isServerId(message.conversationId) && message.status === 'pending'
    && !useChatStore.getState().messages.some((other) => other.conversationId === message.conversationId && (other.type === 'text') === (message.type === 'text') && preparing.has(other.id))),
  available: () => outgoingReady && useAuthStore.getState().activated && useNetworkStore.getState().network !== 'offline',
  concurrency: () => constrainedDevice() || useNetworkStore.getState().network === 'slow' || useSettingsStore.getState().dataSaver ? 1 : 2,
  send: async (id) => { const message = useChatStore.getState().messages.find((item) => item.id === id); if (message) await prepareAndSend(message); },
});
switchChatAccount();
useAuthStore.subscribe((state, previous) => {
  if (state.currentUser.id === previous.currentUser.id && state.activated === previous.activated) return;
  invalidateApiSession();
  switchChatAccount();
});
useChatStore.subscribe((state, previous) => {
  if (state.messages !== previous.messages) outgoing.wake();
  if (!useAuthStore.getState().activated || (state.messages === previous.messages && state.conversations === previous.conversations)) return;
  window.clearTimeout(cacheTimer);
  cacheTimer = window.setTimeout(() => {
    try { persistChat(); }
    catch { if (!useChatStore.getState().lastError) useChatStore.setState({ lastError: 'تعذر حفظ البيانات محليًا. تحقق من المساحة المتاحة.' }); }
  }, 250);
});

window.addEventListener('pagehide', () => {
  if (!useAuthStore.getState().activated) return;
  try { persistChat(); } catch { /* The visible storage error is handled during normal saves. */ }
});
