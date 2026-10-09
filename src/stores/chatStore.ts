import { create } from 'zustand';
import { MESSAGE_PAGE_SIZE, NOTIFICATIONS_PAGE_SIZE, READ_DELAY_MS, READ_STAGGER_MS } from '../constants/chat';
import { CONVERSATIONS, GLOBAL_CHAT_ID } from '../data/conversations';
import { MESSAGES } from '../data/messages';
import { SEED_READ_CURSORS, SEED_READ_TIMES } from '../data/readCursors';
import { applyReaction } from '../lib/reactions';
import { advanceCursor, noteReadTime, type ReadCursors, type ReadTimes } from '../lib/readReceipts';
import { isServerId, mergeHomeMessages, readHomePayload, readOpenedRoom, readRoomMessages, readRoomReaders, readUpdatedRoom, SERVER_GLOBAL_ROOM_ID } from '../lib/home';
import { readInboxPayload, readInboxUnread } from '../lib/inbox';
import type { InboxItem } from '../lib/inbox';
import { firstUrl, linkDraft, siteHost } from '../lib/link';
import { AdminApiError, adminFetch, adminFetchBlob, invalidateApiSession } from '../lib/adminApi';
import { loadChatSnapshot, saveChatSnapshot, releaseMedia } from '../lib/chatCache';
import { mergeRoomWindow } from '../lib/chatWindow';
import { prepareMedia } from '../lib/mediaPreparation';
import { fitChatImage, jpegDataUrl } from '../lib/chatImage';
import { bytesToBase64, FILE_BYTES_MAX } from '../lib/chatFile';
import { ORIGINAL_IMAGE_SIZE, ORIGINAL_VIDEO_SIZE, expectedImageSize, expectedVideoSize } from '../lib/media';
import { isPrivateBetween } from '../lib/conversation';
import { canEditRoom } from '../lib/roles';
import type { Conversation } from '../types/conversation';
import type { User } from '../types/user';
import type { Message, MessageStatus } from '../types/message';
import type { ImageQuality, VideoQuality } from '../types/settings';

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

const PAGE_SIZE = MESSAGE_PAGE_SIZE;
const readTimers = new Map<string, number[]>();
const timers = new Map<string, number[]>();
const preparing = new Set<string>();

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
  updateGroup: (conversationId: string, patch: { name?: string; bio?: string; avatarUrl?: string; bannerUrl?: string }) => Promise<boolean>;
  pauseOutgoing: () => void;
  flushOutgoing: () => void;
  resetMediaCache: () => void;
  loadHome: () => Promise<'ok' | 'local' | 'offline' | 'invalid'>;
  loadRoom: (conversationId: string, page?: { beforeId?: string; aroundId?: string }) => Promise<boolean>;
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

function localGroupLine(actor: string, patch: { name?: string; avatarUrl?: string; bannerUrl?: string }) {
  const clauses: string[] = [];
  if (patch.name) clauses.push(`غيّر اسم المجموعة إلى «${patch.name}»`);
  if (patch.avatarUrl) clauses.push('غيّر صورة المجموعة');
  if (patch.bannerUrl) clauses.push('غيّر غلاف المجموعة');
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

async function publishText(message: Message) {
  const text = message.text?.trim() ?? '';
  if (!text) {
    patchMessage(message.id, { status: 'failed' });
    return;
  }
  try {
    await adminFetch(`/api/rooms/${message.conversationId}/messages`, {
      method: 'POST',
      body: {
        id: message.id,
        text,
        ...(message.replyToId && isServerId(message.replyToId) ? { replyToId: message.replyToId } : {}),
      },
    });
    patchMessage(message.id, { status: 'sent', uploadProgress: undefined });
  } catch {
    patchMessage(message.id, { status: 'failed', uploadProgress: undefined });
  }
}

async function publishImage(message: Message) {
  const source = message.media?.localPreviewUrl;
  if (!source) {
    patchMessage(message.id, { status: 'failed' });
    return;
  }
  // Preparation already applied the user's selected quality; preserve it on upload.
  const fitted = await fitChatImage(source, 'original');
  const current = useChatStore.getState().messages.find((item) => item.id === message.id);
  if (!fitted || !current) {
    patchMessage(message.id, { status: 'failed' });
    return;
  }
  patchMessage(message.id, {
    media: {
      fileName: current.media?.fileName ?? 'photo.jpg',
      fileSize: fitted.bytes,
      localPreviewUrl: fitted.url,
      state: 'cached',
      ...(fitted.width > 0 && fitted.height > 0 ? { width: fitted.width, height: fitted.height } : {}),
    },
  });
  try {
    await adminFetch(`/api/rooms/${message.conversationId}/messages`, {
      method: 'POST',
      body: {
        id: message.id,
        image: fitted.url,
        ...(message.replyToId && isServerId(message.replyToId) ? { replyToId: message.replyToId } : {}),
      },
    });
    patchMessage(message.id, { status: 'sent', uploadProgress: undefined });
  } catch {
    patchMessage(message.id, { status: 'failed', uploadProgress: undefined });
  }
}

async function pullServerImage(message: Message) {
  if (!message.media) return;
  patchMessage(message.id, {
    downloadFailed: false,
    downloadProgress: 0,
    media: { ...message.media, state: 'downloading' },
  });
  try {
    const blob = await adminFetchBlob(`/api/rooms/${message.conversationId}/messages/${message.id}/image`);
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
    useSettingsStore.getState().addUsage('images', blob.size);
  } catch {
    const current = useChatStore.getState().messages.find((item) => item.id === message.id);
    patchMessage(message.id, {
      downloadFailed: true,
      downloadProgress: undefined,
      media: current?.media ? { ...current.media, state: 'remote' } : undefined,
    });
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
    const response = await fetch(source);
    if (!response.ok) throw new Error('read');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 1 || bytes.byteLength > FILE_BYTES_MAX) {
      patchMessage(message.id, { status: 'failed' });
      return;
    }
    await adminFetch(`/api/rooms/${message.conversationId}/messages`, {
      method: 'POST',
      body: {
        id: message.id,
        file: { name, data: bytesToBase64(bytes) },
        ...(message.replyToId && isServerId(message.replyToId) ? { replyToId: message.replyToId } : {}),
      },
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
  } catch {
    patchMessage(message.id, { status: 'failed', uploadProgress: undefined });
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
    const blob = await adminFetchBlob(`/api/rooms/${message.conversationId}/messages/${message.id}/file`);
    if (blob.size < 1 || blob.size > FILE_BYTES_MAX) throw new Error('size');
    const current = useChatStore.getState().messages.find((item) => item.id === message.id);
    if (!current?.media) return;
    patchMessage(message.id, {
      downloadFailed: false,
      downloadProgress: undefined,
      media: { ...current.media, localPreviewUrl: URL.createObjectURL(blob), fileSize: blob.size, state: 'cached' },
    });
    useSettingsStore.getState().addUsage('other', blob.size);
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
    void prepareAndSend(message);
    return;
  }
  if (message.status !== 'sent' && message.status !== 'failed') scheduleDelivery(message.id);
}

function persistChat() {
  const me = useAuthStore.getState().currentUser.id;
  const state = useChatStore.getState();
  saveChatSnapshot(me, {
    conversations: state.conversations.filter((room) => room.participantIds.includes(me)),
    messages: state.messages,
    users: useUserStore.getState().users,
  });
}

async function prepareAndSend(message: Message) {
  if (preparing.has(message.id)) return;
  preparing.add(message.id);
  const owner = useAuthStore.getState().currentUser.id;
  try {
    if (message.type === 'image') {
      const source = message.media?.localPreviewUrl;
      const fitted = source ? await prepareMedia(() => fitChatImage(source, useSettingsStore.getState().imageQuality)) : null;
      if (!fitted || !message.media) throw new Error('invalid_image');
      patchMessage(message.id, { media: { ...message.media, localPreviewUrl: fitted.url, fileSize: fitted.bytes, width: fitted.width, height: fitted.height } });
      if (message.media.localPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(message.media.localPreviewUrl);
    } else if (message.type === 'file' && message.media && !message.media.localPreviewUrl?.startsWith('data:')) {
      if (!message.media.localPreviewUrl || message.media.fileSize > FILE_BYTES_MAX) throw new Error('file_too_large');
      const source = message.media.localPreviewUrl;
      const prepared = await prepareMedia(async () => {
        const blob = await fetch(source).then((response) => response.blob());
        if (blob.size > FILE_BYTES_MAX) throw new Error('file_too_large');
        return { size: blob.size, data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
      });
      patchMessage(message.id, { media: { ...message.media, fileSize: prepared.size, localPreviewUrl: `data:application/octet-stream;base64,${prepared.data}` } });
      if (message.media.localPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(message.media.localPreviewUrl);
    }
    if (owner !== useAuthStore.getState().currentUser.id || !useAuthStore.getState().activated) return;
    const ready = useChatStore.getState().messages.find((item) => item.id === message.id);
    if (!ready) return;
    persistChat();
    if (useNetworkStore.getState().network === 'offline' || ready.status === 'failed') return;
    patchMessage(message.id, { status: 'sending' });
    if (serverText(ready)) await publishText(ready);
    else if (serverImage(ready)) await publishImage(ready);
    else if (serverFile(ready)) await publishFile(ready);
    else throw new Error('unsupported_media');
  } catch {
    if (owner !== useAuthStore.getState().currentUser.id) return;
    patchMessage(message.id, { status: 'failed', uploadProgress: undefined });
    useChatStore.setState({ lastError: 'تعذر تجهيز أو حفظ الرسالة. تحقق من حجم الملف والمساحة المتاحة ثم أعد المحاولة.' });
  } finally {
    preparing.delete(message.id);
  }
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
    if (isServerId(accountRoom(conversationId))) {
      set({ lastError: 'إرسال الفيديو غير متاح بعد. لم يتم إرسال أو حفظ فيديو وهمي.' });
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
    if (isServerId(message.conversationId)) void prepareAndSend({ ...message, status: 'sending' });
    else scheduleDelivery(messageId);
  },
  cancelMessage: (messageId) => {
    clearTimers(messageId);
    patchMessage(messageId, { status: 'failed', uploadProgress: undefined });
  },
  downloadMedia: (messageId) => {
    const message = get().messages.find((item) => item.id === messageId);
    if (!message?.media || message.media.state === 'cached' || message.media.state === 'downloading') return;
    if (useNetworkStore.getState().network === 'offline') {
      patchMessage(messageId, { downloadFailed: true });
      return;
    }
    if (isServerId(message.conversationId) && message.type === 'image') {
      void pullServerImage(message);
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
    if (!message?.link || message.link.preview === 'loaded' || useNetworkStore.getState().network === 'offline') return;
    patchMessage(messageId, { link: { ...message.link, preview: 'loading' } });
    const wait = useNetworkStore.getState().network === 'slow' ? 1400 : 500;
    window.setTimeout(() => {
      const current = useChatStore.getState().messages.find((item) => item.id === messageId);
      if (!current?.link) return;
      patchMessage(messageId, {
        link: {
          ...current.link,
          preview: 'loaded',
          title: current.link.title || siteHost(current.link.url),
        },
      });
    }, wait);
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
      if (!messageId || get().readCursors[conversationId]?.[useAuthStore.getState().currentUser.id] === messageId) return true;
      const owner = useAuthStore.getState().currentUser.id;
      const previous = get().messages.find((item) => item.id === get().readCursors[conversationId]?.[owner]);
      const target = get().messages.find((item) => item.id === messageId && item.conversationId === conversationId);
      if (!target) return false;
      if (previous && (previous.createdAt > target.createdAt || (previous.createdAt === target.createdAt && previous.id >= target.id))) return true;
      try {
        const result = await adminFetch(`/api/rooms/${conversationId}/read`, { method: 'POST', body: { messageId } }) as { unreadCount?: number; unreadNotifications?: number } | null;
        if (owner !== useAuthStore.getState().currentUser.id) return false;
        set((state) => ({ readCursors: { ...state.readCursors, [conversationId]: { ...state.readCursors[conversationId], [useAuthStore.getState().currentUser.id]: messageId } } }));
        if (result && Number.isInteger(result.unreadCount) && result.unreadCount! >= 0 && Number.isInteger(result.unreadNotifications) && result.unreadNotifications! >= 0) {
          set((state) => ({
            conversations: state.conversations.map((room) => room.id === conversationId ? { ...room, unreadCount: result.unreadCount! } : room),
            serverUnread: result.unreadNotifications!,
          }));
        } else {
          // Compatibility with a server that has not received the smaller read response yet.
          await get().loadInbox();
          await get().loadHome();
        }
        return true;
      } catch { set({ lastError: 'تعذر حفظ حالة القراءة. ستتم إعادة المحاولة عند عرض الرسالة.' }); return false; }
    }
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
      ),
    }));
    return true;
  },
  markAllRead: () => {
    set((state) => ({
      serverInbox: state.serverInbox.map((item) => ({ ...item, unread: false, unreadCount: 0 })),
      serverUnread: 0,
      conversations: state.conversations.map((conversation) =>
        conversation.type === 'private' || conversation.unreadCount === 0
          ? conversation
          : { ...conversation, unreadCount: 0 },
      ),
    }));
    if (isServerId(useAuthStore.getState().currentUser.id)) {
      void adminFetch('/api/notifications/read', { method: 'POST', body: { all: true } }).catch(() => {
        set({ lastError: 'تعذر حفظ قراءة الإشعارات. أعد المحاولة.' });
        void get().loadInbox();
      });
    }
  },
  markNotificationsRead: (ids) => {
    if (ids.length === 0) return;
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
    if (isServerId(useAuthStore.getState().currentUser.id)) {
      const owner = useAuthStore.getState().currentUser.id;
      void (async () => {
        try {
          for (let index = 0; index < ids.length; index += 30) {
            await adminFetch('/api/notifications/read', { method: 'POST', body: { ids: ids.slice(index, index + 30) } });
          }
        } catch {
          if (owner !== useAuthStore.getState().currentUser.id) return;
          set((state) => ({ inboxReadIds: state.inboxReadIds.filter((id) => !ids.includes(id)), lastError: 'تعذر حفظ قراءة الإشعارات. أعد المحاولة.' }));
          void get().loadInbox();
        }
      })();
    }
  },
  clearInbox: () => {
    set((state) => ({
      inboxClearedAt: new Date().toISOString(),
      serverInbox: [],
      serverUnread: 0,
      inboxHasMore: false,
      conversations: state.conversations.map((conversation) =>
        conversation.type === 'private' || conversation.unreadCount === 0
          ? conversation
          : { ...conversation, unreadCount: 0 },
      ),
    }));
    if (isServerId(useAuthStore.getState().currentUser.id)) {
      const owner = useAuthStore.getState().currentUser.id;
      void adminFetch('/api/notifications/clear', { method: 'POST' }).catch(() => {
        if (owner !== useAuthStore.getState().currentUser.id) return;
        set({ inboxClearedAt: null, lastError: 'تعذر مسح الإشعارات. أعد المحاولة.' });
        void get().loadInbox();
      });
    }
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
    const existing = get().conversations.find((conversation) => isPrivateBetween(conversation, currentUserId, userId));
    if (existing) return existing.id;
    if (isServerId(currentUserId)) {
      if (!isServerId(userId)) return '';
      try {
        const opened = readOpenedRoom(await adminFetch('/api/rooms', { method: 'POST', body: { kind: 'private', userId } }));
        if (!opened || opened.conversation.type !== 'private') return '';
        rememberPeople(opened.users);
        rememberConversation(opened.conversation);
        return opened.conversation.id;
      } catch {
        return '';
      }
    }
    const other = useUserStore.getState().users.find((user) => user.id === userId);
    if (!other || other.id === currentUserId) return '';
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
      const body: { name?: string; bio?: string; avatar?: string; banner?: string } = {};
      if (name && name !== current?.name) body.name = name;
      if (patch.bio !== undefined && patch.bio.trim() !== (current?.bio ?? '')) body.bio = patch.bio.trim();
      if (patch.avatarUrl) body.avatar = patch.avatarUrl;
      if (patch.bannerUrl) body.banner = patch.bannerUrl;
      if (!body.name && body.bio === undefined && !body.avatar && !body.banner) return true;
      try {
        const saved = readUpdatedRoom(await adminFetch(`/api/rooms/${conversationId}`, { method: 'PATCH', body }));
        if (!saved) throw new Error('bad');
        set((state) => ({
          lastError: '',
          conversations: state.conversations.some((item) => item.id === saved.conversation.id)
            ? state.conversations.map((item) => (item.id === saved.conversation.id ? { ...item, ...saved.conversation, unreadCount: item.unreadCount } : item))
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
        return {
          ...conversation,
          ...(name ? { name } : {}),
          ...(patch.bio !== undefined ? { bio: patch.bio.trim() } : {}),
          ...(patch.avatarUrl ? { avatarUrl: patch.avatarUrl } : {}),
          ...(patch.bannerUrl ? { bannerUrl: patch.bannerUrl } : {}),
        };
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
    get()
      .messages.filter((message) => message.status === 'pending')
      .forEach((message, index) => {
        window.setTimeout(() => {
          if (isServerId(message.conversationId)) {
            const current = get().messages.find((item) => item.id === message.id);
            if (!current || current.status !== 'pending') return;
            patchMessage(message.id, { status: 'sending' });
            void prepareAndSend({ ...current, status: 'sending' });
            return;
          }
          scheduleDelivery(message.id);
        }, index * 280);
      });
  },
  loadInbox: async (before) => {
    const me = useAuthStore.getState().currentUser.id;
    if (!isServerId(me)) return 'local';
    const query = before ? `?before=${encodeURIComponent(before.at)}&beforeId=${encodeURIComponent(before.id)}` : '';
    try {
      const payload = await adminFetch(`/api/notifications${query}`);
      if (me !== useAuthStore.getState().currentUser.id || !useAuthStore.getState().activated) return 'invalid';
      const items = readInboxPayload(payload);
      const unread = readInboxUnread(payload);
      if (!items || unread === null) return 'invalid';
      set((state) => ({
        serverInbox: mergeInbox(state.serverInbox, items, Boolean(before)),
        serverUnread: unread,
        inboxHasMore: items.length === NOTIFICATIONS_PAGE_SIZE,
      }));
      return 'ok';
    } catch (error) {
      const offline = !(error instanceof AdminApiError) || error.code === 'offline' || error.code === 'unavailable';
      return offline ? 'offline' : 'invalid';
    }
  },
  loadHome: async () => {
    const me = useAuthStore.getState().currentUser.id;
    if (!isServerId(me)) return 'local';
    try {
      const home = readHomePayload(await adminFetch('/api/home'));
      if (me !== useAuthStore.getState().currentUser.id || !useAuthStore.getState().activated) return 'invalid';
      if (!home) return 'invalid';
      const users = useUserStore.getState();
      for (const user of home.users) {
        if (users.users.some((item) => item.id === user.id)) {
          const { status, ...profile } = user;
          users.updateUser(user.id, profile);
        } else users.addUser(user);
      }
      set((state) => ({
        conversations: home.conversations,
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
    const owner = useAuthStore.getState().currentUser.id;
    try {
      const params = new URLSearchParams();
      if (page?.beforeId) params.set('beforeId', page.beforeId);
      if (page?.aroundId) params.set('aroundId', page.aroundId);
      const payload = await adminFetch(`/api/rooms/${conversationId}/messages${params.size ? `?${params}` : ''}`);
      if (owner !== useAuthStore.getState().currentUser.id) return false;
      const remote = readRoomMessages(payload, conversationId);
      if (!remote) {
        return false;
      }
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
      const merged = mergeRoomWindow(get().messages, shown, conversationId, page?.beforeId ? 'older' : page?.aroundId ? 'around' : 'latest');
      const keptIds = new Set(merged.map((item) => item.id));
      releaseMedia(get().messages.filter((item) => !keptIds.has(item.id)));
      set((state) => ({
        fullRooms: state.fullRooms.includes(conversationId) ? state.fullRooms : [...state.fullRooms, conversationId],
        messages: merged,
        roomHasMore: page?.beforeId || page?.aroundId || state.roomHasMore[conversationId] === undefined
          ? { ...state.roomHasMore, [conversationId]: Boolean((payload as { hasMore?: unknown }).hasMore) } : state.roomHasMore,
        conversations: state.conversations.map((conversation) => conversation.id === conversationId && !page && last ? { ...conversation, lastMessageId: last.id } : conversation),
        readCursors: { ...state.readCursors, [conversationId]: cursors },
        readTimes: { ...state.readTimes, [conversationId]: times },
      }));
      if (page?.aroundId) get().revealMessage(conversationId, page.aroundId);
      return true;
    } catch {
      if (owner === useAuthStore.getState().currentUser.id) set({ lastError: 'تعذر تحميل الرسائل. تحقق من الاتصال ثم أعد المحاولة.' });
      return false;
    }
  },
  resetMediaCache: () => {
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
    if (!message || message.senderId !== me || message.deletedForEveryone || message.event) return;
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
        await adminFetch(`/api/rooms/${message.conversationId}/messages/${message.id}`, { method: 'PATCH', body: { text } });
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

useNetworkStore.subscribe((state, previous) => {
  if (state.network === previous.network) return;
  if (state.network === 'offline') useChatStore.getState().pauseOutgoing();
  else useChatStore.getState().flushOutgoing();
});

let cacheTimer: number | undefined;
function switchChatAccount() {
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
    serverInbox: [], serverUnread: 0, inboxHasMore: false, inboxReadIds: [], inboxClearedAt: null,
    editingId: null, replyingTo: null, lastError: '',
  });
  useUserStore.setState({ users: snapshot?.users ?? [auth.currentUser] });
  if (auth.activated && useNetworkStore.getState().network !== 'offline') useChatStore.getState().flushOutgoing();
}

switchChatAccount();
useAuthStore.subscribe((state, previous) => {
  if (state.currentUser.id === previous.currentUser.id && state.activated === previous.activated) return;
  invalidateApiSession();
  switchChatAccount();
});
useChatStore.subscribe((state, previous) => {
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
