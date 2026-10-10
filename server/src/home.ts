import { randomUUID } from 'node:crypto';
import { safeJpeg } from './jpeg.ts';
import type { Deps } from './authService.ts';
import { hashSession } from './session.ts';
import type { AuthUser, HomeRoom, RoomMessage, StoredReaction } from './types.ts';
import { GROUP_TURN_MS, groupTurnNotice } from './groupTurn.ts';
import { sendMessagePush } from './push.ts';
import { wakeRoom } from './roomLive.ts';
import { cleanBio, cleanAvatar, cleanBanner } from './profile.ts';
import { cleanHints, cleanSealed, FILE_BYTES_MAX, IMAGE_BYTES_MAX, isSealed, isVideoFileName, SEALED_FILE_NAME, SEALED_OVERHEAD, SEALED_VIDEO_NAME, VIDEO_BYTES_MAX } from './sealed.ts';

export const GLOBAL_ROOM_ID = '00000000-0000-4000-8000-000000000001';
export const ROOM_PAGE_SIZE = 30;
const AROUND_PAGE_SIZE = 120;

const ROOM_ID = /^[0-9a-f-]{36}$/i;
const JPEG_PREFIX = 'data:image/jpeg;base64,/9j/';
const IMAGE_URL_MAX = 80_000;
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
  if (!safeJpeg(bytes)) return false;
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
    ...(user.accentColor ? { color: user.accentColor } : {}),
    ...(user.messageFont && user.messageFont !== 'system' ? { messageFont: user.messageFont } : {}),
  };
}

function roomView(room: HomeRoom) {
  return {
    id: room.id,
    type: room.kind,
    ...(room.name ? { name: room.name } : {}),
    participantIds: room.participantIds,
    ...(room.self ? { self: true } : {}),
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
              ? { type: isVideoFileName(room.lastMessage.fileName) ? 'video' as const : 'file' as const, fileName: room.lastMessage.fileName }
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
    ...(file ? { type: isVideoFileName(file.fileName) ? 'video' as const : 'file' as const, fileName: file.fileName, fileSize: file.fileSize } : {}),
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
    await deps.repo.notifyTurnMembers(saved);
    wakeRoom(room.id);
  }
  return posted ? deps.repo.listHome(userId, at) : rooms;
}

export async function readGroupTurn(deps: Deps, token: string, roomId: string) {
  const user = await sessionUser(deps, token);
  if (!user || user.role !== 'member') return { ok: false as const, error: 'invalid_credentials' as const };
  if (!ROOM_ID.test(roomId)) return { ok: false as const, error: 'not_found' as const };
  const at = new Date(deps.now());
  const turn = await deps.repo.readGroupTurn(roomId, user.id, at);
  if (!turn) return { ok: false as const, error: 'not_found' as const };
  const holder = await deps.repo.findUserById(turn.holderId);
  if (!holder) return { ok: false as const, error: 'unavailable' as const };
  if (turn.members.length > 1 && await deps.repo.claimTurnNotice(roomId, turn.holderId)) {
    const notice = await deps.repo.addRoomMessage({ id: randomUUID(), roomId, senderId: turn.holderId,
      text: groupTurnNotice(holder.displayName, turn.opensAt, at.getTime()), createdAt: at, deleted: false, event: true });
    if (notice !== 'missing' && notice !== 'invalid') {
      await deps.repo.notifyTurnMembers(notice);
      wakeRoom(roomId);
    }
  }
  return { ok: true as const, roomId, turnUserId: turn.holderId, turnOpensAt: new Date(turn.opensAt).toISOString(),
    turnExpiresAt: new Date(turn.opensAt + GROUP_TURN_MS).toISOString(), serverTime: at.toISOString(),
    participantIds: turn.members, holder: memberView(holder) };
}

export async function dropOrphanPrivate(deps: Deps, input: { token: string; roomId: string }) {
  const user = await sessionUser(deps, input.token);
  if (!user) return { ok: false as const, error: 'invalid_credentials' as const };
  if (!ROOM_ID.test(input.roomId) || input.roomId === GLOBAL_ROOM_ID) return { ok: false as const, error: 'forbidden' as const };
  const result = await deps.repo.dropOrphanPrivate(input.roomId, user.id);
  if (result === 'ok') return { ok: true as const };
  return { ok: false as const, error: result === 'forbidden' ? 'forbidden' as const : 'not_found' as const };
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
  const around = Boolean(input.aroundId);
  const messages = await deps.repo.listRoomMessages(input.roomId, user.id, around ? AROUND_PAGE_SIZE : ROOM_PAGE_SIZE + 1, {
    beforeId: input.beforeId || undefined, aroundId: input.aroundId || undefined,
  });
  if (!messages) return { ok: false as const, error: 'not_found' as const };
  if (input.aroundId && !messages.some((message) => message.id === input.aroundId)) return { ok: false as const, error: 'not_found' as const };
  const page = around ? messages : messages.slice(-ROOM_PAGE_SIZE);
  const older = around && page[0] ? await deps.repo.listRoomMessages(input.roomId, user.id, 1, { beforeId: page[0].id }) : null;
  const reactions = await deps.repo.listReactions(input.roomId, page.map((message) => message.id));
  const readers = await deps.repo.listReaders(input.roomId);
  return {
    ok: true as const,
    messages: page.map((message) => messageView(message, reactions)),
    hasMore: around ? (older?.length ?? 0) > 0 : messages.length > ROOM_PAGE_SIZE,
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
  wakeRoom(input.roomId);
  const [rooms, unreadNotifications] = await Promise.all([deps.repo.listHome(user.id, new Date(deps.now())), deps.repo.countUnreadNotifications(user.id)]);
  return { ok: true as const, unreadCount: rooms.find((room) => room.id === input.roomId)?.unreadCount ?? 0, unreadNotifications };
}

/** Plain text stays accepted for older app builds; an `e2e1.` prefix must be a well-formed envelope. */
function cleanMessageBody(value: unknown) {
  if (typeof value === 'string' && isSealed(value)) return cleanSealed(value);
  return cleanRoomText(value);
}

export async function changeMessage(deps: Deps, input: { token: string; roomId: string; messageId: string; text: unknown; deleting: boolean }) {
  const user = await sessionUser(deps, input.token);
  if (!user || user.role !== 'member') return { ok: false as const, error: 'invalid_credentials' as const };
  const text = input.deleting ? null : cleanMessageBody(input.text);
  if ((!input.deleting && !text) || !ROOM_ID.test(input.roomId) || !ROOM_ID.test(input.messageId)) return { ok: false as const, error: 'invalid_credentials' as const };
  const ok = await deps.repo.changeRoomMessage(input.roomId, user.id, input.messageId, text, new Date(deps.now()));
  if (!ok) return { ok: false as const, error: 'not_found' as const };
  wakeRoom(input.roomId);
  return { ok: true as const };
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
    if (saved !== 'missing' && saved !== 'invalid') {
      await deps.repo.notifyRoomMessage(saved);
      wakeRoom(input.roomId);
    }
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
  wakeRoom(input.roomId);
  return { ok: true as const };
}

export async function openRoom(deps: Deps, input: { token: string; kind: unknown; userId: unknown; name: unknown; memberIds: unknown }) {
  const user = await sessionUser(deps, input.token);
  if (!user || user.role !== 'member') return { ok: false as const, error: 'invalid_credentials' as const };
  await deps.repo.ensureHome(user.id);
  let created: string | 'invalid' = 'invalid';
  if (input.kind === 'private') {
    if (typeof input.userId !== 'string' || !ROOM_ID.test(input.userId)) {
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

export type SealedMedia = { kind: 'image' | 'file' | 'video'; bytes: Uint8Array };

function sealedAttachment(media: SealedMedia) {
  const max = (media.kind === 'image' ? IMAGE_BYTES_MAX : media.kind === 'video' ? VIDEO_BYTES_MAX : FILE_BYTES_MAX) + SEALED_OVERHEAD;
  if (media.bytes.byteLength <= SEALED_OVERHEAD || media.bytes.byteLength > max) return null;
  if (media.kind === 'image') return { image: media.bytes, file: null };
  return { image: null, file: { name: media.kind === 'video' ? SEALED_VIDEO_NAME : SEALED_FILE_NAME, bytes: media.bytes } };
}

export async function postRoomMessage(deps: Deps, input: { token: string; roomId: string; id: unknown; text: unknown; replyToId: unknown; image: unknown; file: unknown; hints?: unknown; sealedMedia?: SealedMedia }) {
  if (!ROOM_ID.test(input.roomId) || typeof input.id !== 'string' || !ROOM_ID.test(input.id)) {
    return { ok: false as const, error: 'invalid_credentials' as const };
  }
  const sealed = typeof input.text === 'string' && isSealed(input.text) ? cleanSealed(input.text) : undefined;
  const hints = cleanHints(input.hints);
  if (sealed === null || !hints) return { ok: false as const, error: 'invalid_credentials' as const };
  let image: Uint8Array | null | false;
  let file: { name: string; bytes: Uint8Array } | null | false;
  let text: string | null;
  if (input.sealedMedia) {
    const attachment = sealed ? sealedAttachment(input.sealedMedia) : null;
    if (!attachment || input.image != null || input.file != null) return { ok: false as const, error: 'invalid_credentials' as const };
    ({ image, file } = attachment);
    text = sealed ?? null;
  } else {
    image = decodeChatImage(input.image);
    file = decodeChatFile(input.file);
    if (image === false || file === false) return { ok: false as const, error: 'invalid_credentials' as const };
    const wroteText = typeof input.text === 'string' && input.text.trim().length > 0;
    if ((image && file) || (image && wroteText) || (file && wroteText)) return { ok: false as const, error: 'invalid_credentials' as const };
    text = image || file ? '' : sealed ?? cleanRoomText(input.text);
    if (!text && !image && !file) return { ok: false as const, error: 'invalid_credentials' as const };
  }
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
  wakeRoom(input.roomId);
  if (!saved.deleted) {
    const payload = sealed ? { ...saved, hints } : saved;
    await deps.repo.notifyRoomMessage(payload);
    void sendMessagePush(deps, payload);
  }
  return { ok: true as const, message: messageView(saved) };
}
