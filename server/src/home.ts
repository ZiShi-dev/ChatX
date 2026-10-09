import { randomUUID } from 'node:crypto';
import type { Deps } from './authService.ts';
import { hashSession } from './session.ts';
import type { AuthUser, HomeRoom, RoomMessage, StoredReaction } from './types.ts';
import { groupTurnNotice } from './groupTurn.ts';
import { cleanBio, cleanAvatar, cleanBanner } from './profile.ts';

export const GLOBAL_ROOM_ID = '00000000-0000-4000-8000-000000000001';
export const ROOM_PAGE_SIZE = 30;

const ROOM_ID = /^[0-9a-f-]{36}$/i;
const JPEG_PREFIX = 'data:image/jpeg;base64,/9j/';
const IMAGE_URL_MAX = 80_000;
const IMAGE_BYTES_MAX = 60_000;
const FILE_BYTES_MAX = 262_144;
const FILE_DATA_MAX = 349_528;

export function cleanFileName(value: unknown) {
  if (typeof value !== 'string') return null;
  const name = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
  if (!name || name.length > 120) return null;
  const parts = name.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  return name;
}

export function decodeChatFile(value: unknown): { name: string; bytes: Uint8Array } | null | false {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as { name?: unknown; data?: unknown };
  const name = cleanFileName(record.name);
  if (!name || typeof record.data !== 'string') return false;
  const data = record.data;
  if (data.length < 4 || data.length > FILE_DATA_MAX || data.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return false;
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length < 1 || bytes.length > FILE_BYTES_MAX) return false;
  return { name, bytes };
}

export function decodeChatImage(value: unknown): Uint8Array | null | false {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length < JPEG_PREFIX.length + 4 || value.length > IMAGE_URL_MAX) return false;
  if (!value.startsWith(JPEG_PREFIX)) return false;
  const data = value.slice('data:image/jpeg;base64,'.length);
  if (data.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return false;
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length < 3 || bytes.length > IMAGE_BYTES_MAX) return false;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return false;
  return bytes;
}

export function cleanRoomText(value: unknown) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (!text || text.length > 4000) return null;
  return text;
}

function memberView(user: AuthUser) {
  return {
    id: user.id,
    displayName: user.displayName,
    username: user.username,
    role: user.role,
    bio: user.bio,
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    ...(user.bannerUrl ? { bannerUrl: user.bannerUrl } : {}),
  };
}

function roomView(room: HomeRoom) {
  return {
    id: room.id,
    type: room.kind,
    ...(room.name ? { name: room.name } : {}),
    participantIds: room.participantIds,
    unreadCount: room.unreadCount,
    createdAt: room.createdAt.toISOString(),
    ...(room.adminId ? { adminId: room.adminId } : {}),
    bio: room.bio ?? '',
    ...(room.avatarUrl ? { avatarUrl: room.avatarUrl } : {}),
    ...(room.bannerUrl ? { bannerUrl: room.bannerUrl } : {}),
    ...(room.kind !== 'private' && room.turnUserId ? { turnUserId: room.turnUserId } : {}),
    ...(room.kind !== 'private' && room.turnOpensAt ? { turnOpensAt: room.turnOpensAt.toISOString() } : {}),
    ...(room.lastMessage
      ? {
          lastMessage: {
            id: room.lastMessage.id,
            senderId: room.lastMessage.senderId,
            text: room.lastMessage.deleted ? '' : room.lastMessage.text,
            createdAt: room.lastMessage.createdAt.toISOString(),
            deleted: room.lastMessage.deleted,
            ...(room.lastMessage.event ? { event: true } : {}),
            ...(!room.lastMessage.deleted && room.lastMessage.imageSize ? { type: 'image' as const } : {}),
            ...(!room.lastMessage.deleted && !room.lastMessage.imageSize && room.lastMessage.fileName
              ? { type: 'file' as const, fileName: room.lastMessage.fileName }
              : {}),
          },
        }
      : {}),
  };
}

export function messageView(message: RoomMessage, reactions: StoredReaction[] = []) {
  const mine = reactions.filter((item) => item.messageId === message.id).map((item) => ({ emoji: item.emoji, userId: item.userId }));
  const image = !message.deleted && message.imageSize ? message.imageSize : 0;
  const file = !image && !message.deleted && message.fileName && message.fileBytes
    ? { fileName: message.fileName, fileSize: message.fileBytes }
    : null;
  return {
    id: message.id,
    conversationId: message.roomId,
    senderId: message.senderId,
    text: message.deleted ? '' : message.text,
    createdAt: message.createdAt.toISOString(),
    deleted: message.deleted,
    ...(message.editedAt ? { editedAt: message.editedAt.toISOString() } : {}),
    ...(image ? { type: 'image' as const, fileSize: image } : {}),
    ...(file ? { type: 'file' as const, fileName: file.fileName, fileSize: file.fileSize } : {}),
    ...(message.replyToId ? { replyToId: message.replyToId } : {}),
    ...(mine.length ? { reactions: mine } : {}),
    ...(message.event ? { event: true } : {}),
  };
}

export function groupChangeLine(actor: string, patch: { name?: string; avatar?: string | null; banner?: string | null }) {
  const clauses: string[] = [];
  if (patch.name !== undefined) clauses.push(`غيّر اسم المجموعة إلى «${patch.name}»`);
  if (patch.avatar !== undefined) clauses.push(patch.avatar ? 'غيّر صورة المجموعة' : 'أزال صورة المجموعة');
  if (patch.banner !== undefined) clauses.push(patch.banner ? 'غيّر غلاف المجموعة' : 'أزال غلاف المجموعة');
  if (!clauses.length) return '';
  const who = actor.trim() || 'عضو';
  return `${who} ${clauses.join(' و')}`.slice(0, 400);
}

function cleanRoomName(value: unknown) {
  if (typeof value !== 'string') return null;
  const name = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!name || [...name].length > 40) return null;
  return name;
}

function cleanEmoji(value: unknown) {
  if (typeof value !== 'string') return null;
  const emoji = value.trim();
  if (!emoji) return '';
  if ([...emoji].length > 16 || /[\s<>]|[A-Za-z]/.test(emoji)) return null;
  return emoji;
}

async function sessionUser(deps: Deps, token: string) {
  if (!token) return null;
  return deps.repo.findSessionUser(hashSession(token), new Date(deps.now()));
}

async function publishTurnNotices(deps: Deps, userId: string) {
  const at = new Date(deps.now());
  const rooms = await deps.repo.listHome(userId, at);
  let posted = false;
  for (const room of rooms) {
    if ((room.kind !== 'group' && room.kind !== 'global') || !room.turnUserId || room.participantIds.length < 2) continue;
    const claimed = await deps.repo.claimTurnNotice(room.id, room.turnUserId);
    if (!claimed) continue;
    const holder = await deps.repo.findUserById(room.turnUserId);
    const saved = await deps.repo.addRoomMessage({
      id: randomUUID(),
      roomId: room.id,
      senderId: room.turnUserId,
      text: groupTurnNotice(holder?.displayName ?? 'عضو', room.turnOpensAt?.getTime() ?? at.getTime(), at.getTime()),
      createdAt: at,
      deleted: false,
      event: true,
    });
    if (saved === 'missing' || saved === 'invalid') continue;
    posted = true;
    await deps.repo.notifyTurnHolder(saved);
  }
  return posted ? deps.repo.listHome(userId, at) : rooms;
}

export async function readHome(deps: Deps, token: string) {
  const user = await sessionUser(deps, token);
  if (!user || user.role !== 'member') return { ok: false as const, error: 'invalid_credentials' as const };
  await deps.repo.ensureHome(user.id);
  const rooms = await publishTurnNotices(deps, user.id);
  const ids = new Set(rooms.flatMap((room) => room.participantIds));
  const users = (await deps.repo.listUsers()).filter((item) => item.role === 'member' && ids.has(item.id));
  return {
    ok: true as const,
    conversations: rooms.map(roomView),
    users: users.map(memberView),
  };
}

export async function readRoomMessages(deps: Deps, input: { token: string; roomId: string; beforeId?: string | null; aroundId?: string | null }) {
  if (!ROOM_ID.test(input.roomId)) return { ok: false as const, error: 'not_found' as const };
  const user = await sessionUser(deps, input.token);
  if (!user || user.role !== 'member') return { ok: false as const, error: 'invalid_credentials' as const };
  if ((input.beforeId && !ROOM_ID.test(input.beforeId)) || (input.aroundId && !ROOM_ID.test(input.aroundId)) || (input.beforeId && input.aroundId)) {
    return { ok: false as const, error: 'invalid_credentials' as const };
  }
  const messages = await deps.repo.listRoomMessages(input.roomId, user.id, ROOM_PAGE_SIZE + 1, {
    beforeId: input.beforeId || undefined, aroundId: input.aroundId || undefined,
  });
  if (!messages) return { ok: false as const, error: 'not_found' as const };
  if (input.aroundId && !messages.some((message) => message.id === input.aroundId)) return { ok: false as const, error: 'not_found' as const };
  const reactions = await deps.repo.listReactions(input.roomId, messages.slice(-ROOM_PAGE_SIZE).map((message) => message.id));
  const readers = await deps.repo.listReaders(input.roomId);
  return {
    ok: true as const,
    messages: messages.slice(-ROOM_PAGE_SIZE).map((message) => messageView(message, reactions)),
    hasMore: messages.length > ROOM_PAGE_SIZE,
    readers: readers.map((reader) => ({
      userId: reader.userId,
      messageId: reader.messageId,
      readAt: reader.readAt.toISOString(),
    })),
  };
}

export async function markRoomSeen(deps: Deps, input: { token: string; roomId: string; messageId: unknown }) {
  const user = await sessionUser(deps, input.token);
  if (!user || user.role !== 'member') return { ok: false as const, error: 'invalid_credentials' as const };
  if (!ROOM_ID.test(input.roomId) || typeof input.messageId !== 'string' || !ROOM_ID.test(input.messageId)) return { ok: false as const, error: 'not_found' as const };
  const ok = await deps.repo.markRoomRead(input.roomId, user.id, new Date(deps.now()), input.messageId);
  if (!ok) return { ok: false as const, error: 'not_found' as const };
  const [rooms, unreadNotifications] = await Promise.all([deps.repo.listHome(user.id, new Date(deps.now())), deps.repo.countUnreadNotifications(user.id)]);
  return { ok: true as const, unreadCount: rooms.find((room) => room.id === input.roomId)?.unreadCount ?? 0, unreadNotifications };
}

export async function changeMessage(deps: Deps, input: { token: string; roomId: string; messageId: string; text: unknown; deleting: boolean }) {
  const user = await sessionUser(deps, input.token);
  if (!user || user.role !== 'member') return { ok: false as const, error: 'invalid_credentials' as const };
  const text = input.deleting ? null : cleanRoomText(input.text);
  if ((!input.deleting && !text) || !ROOM_ID.test(input.roomId) || !ROOM_ID.test(input.messageId)) return { ok: false as const, error: 'invalid_credentials' as const };
  const ok = await deps.repo.changeRoomMessage(input.roomId, user.id, input.messageId, text, new Date(deps.now()));
  return ok ? { ok: true as const } : { ok: false as const, error: 'not_found' as const };
}

export async function updateRoomProfile(deps: Deps, input: { token: string; roomId: string; patch: Record<string, unknown> }) {
  const user = await sessionUser(deps, input.token);
  if (!user) return { ok: false as const, error: 'invalid_credentials' as const };
  if (!ROOM_ID.test(input.roomId)) return { ok: false as const, error: 'forbidden' as const };
  const patch: { name?: string; bio?: string; avatar?: string | null; banner?: string | null } = {};
  for (const key of Object.keys(input.patch)) {
    if (!['name', 'bio', 'avatar', 'banner'].includes(key)) return { ok: false as const, error: 'invalid_credentials' as const };
  }
  if ('name' in input.patch) {
    const name = cleanRoomName(input.patch.name);
    if (!name) return { ok: false as const, error: 'invalid_credentials' as const };
    patch.name = name;
  }
  if ('bio' in input.patch) {
    const bio = cleanBio(input.patch.bio);
    if (bio === null) return { ok: false as const, error: 'invalid_credentials' as const };
    patch.bio = bio;
  }
  if ('avatar' in input.patch) {
    const avatar = cleanAvatar(input.patch.avatar);
    if (!avatar.ok) return { ok: false as const, error: 'invalid_credentials' as const };
    patch.avatar = avatar.value;
  }
  if ('banner' in input.patch) {
    const banner = cleanBanner(input.patch.banner);
    if (!banner.ok) return { ok: false as const, error: 'invalid_credentials' as const };
    patch.banner = banner.value;
  }
  const at = new Date(deps.now());
  const ok = await deps.repo.updateRoom(input.roomId, user.id, patch, at);
  if (!ok) return { ok: false as const, error: 'forbidden' as const };
  const line = groupChangeLine(user.displayName, patch);
  if (line) {
    const saved = await deps.repo.addRoomMessage({
      id: randomUUID(),
      roomId: input.roomId,
      senderId: user.id,
      text: line,
      createdAt: at,
      deleted: false,
      event: true,
    });
    if (saved !== 'missing' && saved !== 'invalid') await deps.repo.notifyRoomMessage(saved);
  }
  const rooms = await publishTurnNotices(deps, user.id);
  const room = rooms.find((item) => item.id === input.roomId);
  return { ok: true as const, conversation: room ? roomView(room) : null };
}

export async function setRoomReaction(deps: Deps, input: { token: string; roomId: string; messageId: string; emoji: unknown }) {
  if (!ROOM_ID.test(input.roomId) || !ROOM_ID.test(input.messageId)) return { ok: false as const, error: 'not_found' as const };
  const emoji = cleanEmoji(input.emoji);
  if (emoji === null) return { ok: false as const, error: 'invalid_credentials' as const };
  const user = await sessionUser(deps, input.token);
  if (!user || user.role !== 'member') return { ok: false as const, error: 'invalid_credentials' as const };
  await deps.repo.ensureHome(user.id);
  const saved = await deps.repo.setReaction({
    roomId: input.roomId,
    messageId: input.messageId,
    userId: user.id,
    emoji: emoji || null,
    at: new Date(deps.now()),
  });
  if (saved === 'missing') return { ok: false as const, error: 'not_found' as const };
  return { ok: true as const };
}

export async function openRoom(deps: Deps, input: { token: string; kind: unknown; userId: unknown; name: unknown; memberIds: unknown }) {
  const user = await sessionUser(deps, input.token);
  if (!user || user.role !== 'member') return { ok: false as const, error: 'invalid_credentials' as const };
  await deps.repo.ensureHome(user.id);
  let created: string | 'invalid' = 'invalid';
  if (input.kind === 'private') {
    if (typeof input.userId !== 'string' || !ROOM_ID.test(input.userId) || input.userId === user.id) {
      return { ok: false as const, error: 'invalid_credentials' as const };
    }
    created = await deps.repo.createRoom({
      id: randomUUID(),
      kind: 'private',
      name: null,
      creatorId: user.id,
      memberIds: [input.userId],
      at: new Date(deps.now()),
    });
  } else if (input.kind === 'group') {
    const name = cleanRoomName(input.name);
    const memberIds = Array.isArray(input.memberIds)
      ? [...new Set(input.memberIds.filter((id): id is string => typeof id === 'string' && ROOM_ID.test(id) && id !== user.id))]
      : [];
    if (!name || memberIds.length < 2 || memberIds.length > 20) return { ok: false as const, error: 'invalid_credentials' as const };
    created = await deps.repo.createRoom({
      id: randomUUID(),
      kind: 'group',
      name,
      creatorId: user.id,
      memberIds,
      at: new Date(deps.now()),
    });
  }
  if (created === 'invalid') return { ok: false as const, error: 'invalid_credentials' as const };
  const rooms = await publishTurnNotices(deps, user.id);
  const room = rooms.find((item) => item.id === created);
  if (!room) return { ok: false as const, error: 'not_found' as const };
  const people = (await deps.repo.listUsers()).filter((item) => item.role === 'member' && room.participantIds.includes(item.id));
  return { ok: true as const, conversation: roomView(room), users: people.map(memberView) };
}

export async function readRoomImage(deps: Deps, input: { token: string; roomId: string; messageId: string }) {
  if (!ROOM_ID.test(input.roomId) || !ROOM_ID.test(input.messageId)) return { ok: false as const, error: 'not_found' as const };
  const user = await sessionUser(deps, input.token);
  if (!user || user.role !== 'member') return { ok: false as const, error: 'invalid_credentials' as const };
  const bytes = await deps.repo.readMessageImage(input.roomId, user.id, input.messageId);
  if (!bytes) return { ok: false as const, error: 'not_found' as const };
  return { ok: true as const, bytes };
}

export async function readRoomFile(deps: Deps, input: { token: string; roomId: string; messageId: string }) {
  if (!ROOM_ID.test(input.roomId) || !ROOM_ID.test(input.messageId)) return { ok: false as const, error: 'not_found' as const };
  const user = await sessionUser(deps, input.token);
  if (!user || user.role !== 'member') return { ok: false as const, error: 'invalid_credentials' as const };
  const file = await deps.repo.readMessageFile(input.roomId, user.id, input.messageId);
  if (!file) return { ok: false as const, error: 'not_found' as const };
  return { ok: true as const, file };
}

export async function postRoomMessage(deps: Deps, input: { token: string; roomId: string; id: unknown; text: unknown; replyToId: unknown; image: unknown; file: unknown }) {
  if (!ROOM_ID.test(input.roomId) || typeof input.id !== 'string' || !ROOM_ID.test(input.id)) {
    return { ok: false as const, error: 'invalid_credentials' as const };
  }
  const image = decodeChatImage(input.image);
  const file = decodeChatFile(input.file);
  if (image === false || file === false) return { ok: false as const, error: 'invalid_credentials' as const };
  const wroteText = typeof input.text === 'string' && input.text.trim().length > 0;
  if ((image && file) || (image && wroteText) || (file && wroteText)) return { ok: false as const, error: 'invalid_credentials' as const };
  const text = image || file ? '' : cleanRoomText(input.text);
  if (!text && !image && !file) return { ok: false as const, error: 'invalid_credentials' as const };
  const replyToId = typeof input.replyToId === 'string' && ROOM_ID.test(input.replyToId) && input.replyToId !== input.id ? input.replyToId : null;
  const user = await sessionUser(deps, input.token);
  if (!user || user.role !== 'member') return { ok: false as const, error: 'invalid_credentials' as const };
  await deps.repo.ensureHome(user.id);
  const saved = await deps.repo.addRoomMessage({
    id: input.id,
    roomId: input.roomId,
    senderId: user.id,
    text: text ?? '',
    createdAt: new Date(deps.now()),
    deleted: false,
    replyToId,
    imageSize: image?.byteLength ?? null,
    fileName: file?.name ?? null,
    fileBytes: file?.bytes.byteLength ?? null,
  }, image, file);
  if (saved === 'missing') return { ok: false as const, error: 'not_found' as const };
  if (saved === 'invalid') return { ok: false as const, error: 'invalid_credentials' as const };
  if (!saved.deleted) await deps.repo.notifyRoomMessage(saved);
  return { ok: true as const, message: messageView(saved) };
}
