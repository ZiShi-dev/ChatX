import { randomInt } from 'node:crypto';
import { GLOBAL_ROOM_ID } from './home.ts';
import { advanceGroupTurn } from './groupTurn.ts';
import { messageKind } from './inbox.ts';
import type { AuthRepository, AuthUser, HomeRoom, InboxNotice, ProfilePatch, RoomMessage, RoomReader, SavedItem, StoredReaction } from './types.ts';

function copyUser(user: AuthUser): AuthUser {
  return { ...user, bio: user.bio ?? '', bannerUrl: user.bannerUrl ?? null, avatarUrl: user.avatarUrl ?? null };
}

export function createMemoryRepository(): AuthRepository {
  const users = new Map<string, AuthUser>();
  const sessions = new Map<string, { userId: string; expiresAt: number; lastSeenAt: number; presence: 'online' | 'away' }>();
  const rooms = new Map<string, { id: string; kind: 'global' | 'group' | 'private'; name: string | null; createdAt: number; pairKey: string | null; adminId?: string; bio?: string; avatarUrl?: string | null; bannerUrl?: string | null; turnUserId?: string; turnOpensAt?: number; turnRound?: number; turnNoticeFor?: string }>();
  const passed = new Map<string, Set<string>>();
  const saved = new Map<string, number>();
  const members = new Map<string, { roomId: string; userId: string; lastReadAt: number | null; lastReadMessageId: string | null }>();
  const messages: RoomMessage[] = [];
  const images = new Map<string, Uint8Array>();
  const files = new Map<string, { name: string; bytes: Uint8Array }>();
  const reactions = new Map<string, StoredReaction & { createdAt: number }>();
  const notices: Array<Omit<InboxNotice, 'conversationName' | 'deleted'> & { userId: string }> = [];
  const clearedAt = new Map<string, number>();
  const memberKey = (roomId: string, userId: string) => `${roomId}:${userId}`;

  return {
    async findUserById(id) {
      const user = users.get(id);
      return user ? copyUser(user) : null;
    },
    async listUsers() {
      return [...users.values()].map(copyUser);
    },
    async insertUser(user) {
      users.set(user.id, copyUser(user));
    },
    async renameMember(id, displayName) {
      const user = users.get(id);
      if (!user || user.role !== 'member') return 'missing';
      const taken = [...users.values()].some((item) => item.id !== id && item.username.toLowerCase() === displayName.toLowerCase());
      if (taken) return 'taken';
      users.set(id, { ...user, displayName, username: displayName });
      return 'ok';
    },
    async updateMemberProfile(id, patch: ProfilePatch) {
      const user = users.get(id);
      if (!user || user.role !== 'member') return 'missing';
      if (patch.displayName && [...users.values()].some((item) => item.id !== id && item.username.toLowerCase() === patch.displayName?.toLowerCase())) {
        return 'taken';
      }
      users.set(id, {
        ...user,
        ...(patch.displayName !== undefined ? { displayName: patch.displayName, username: patch.displayName } : {}),
        ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
        ...(patch.banner !== undefined ? { bannerUrl: patch.banner } : {}),
        ...(patch.avatar !== undefined ? { avatarUrl: patch.avatar } : {}),
      });
      return 'ok';
    },
    async createSession(tokenHash, userId, expiresAt) {
      sessions.set(tokenHash, { userId, expiresAt: expiresAt.getTime(), lastSeenAt: 0, presence: 'online' });
    },
    async findSessionUser(tokenHash, now) {
      const session = sessions.get(tokenHash);
      if (!session) return null;
      if (session.expiresAt <= now.getTime()) {
        sessions.delete(tokenHash);
        return null;
      }
      const user = users.get(session.userId);
      return user ? copyUser(user) : null;
    },
    async deleteSession(tokenHash) {
      sessions.delete(tokenHash);
    },
    async touchPresence(tokenHash, presence, now) {
      const session = sessions.get(tokenHash);
      if (!session || session.expiresAt <= now.getTime()) return false;
      session.lastSeenAt = now.getTime();
      session.presence = presence;
      return true;
    },
    async ensureHome(userId) {
      if (!rooms.has(GLOBAL_ROOM_ID)) {
        rooms.set(GLOBAL_ROOM_ID, { id: GLOBAL_ROOM_ID, kind: 'global', name: 'ChatX', createdAt: Date.parse('2026-01-01T00:00:00.000Z'), pairKey: null });
      }
      for (const user of users.values()) {
        if (user.role !== 'member') continue;
        const key = memberKey(GLOBAL_ROOM_ID, user.id);
        if (!members.has(key)) members.set(key, { roomId: GLOBAL_ROOM_ID, userId: user.id, lastReadAt: null, lastReadMessageId: null });
      }
      if (users.get(userId)?.role === 'member' && !members.has(memberKey(GLOBAL_ROOM_ID, userId))) {
        members.set(memberKey(GLOBAL_ROOM_ID, userId), { roomId: GLOBAL_ROOM_ID, userId, lastReadAt: null, lastReadMessageId: null });
      }
    },
    async listHome(userId) {
      const mine = [...members.values()].filter((member) => member.userId === userId);
      const home: HomeRoom[] = [];
      for (const member of mine) {
        const room = rooms.get(member.roomId);
        if (!room) continue;
        if (room.kind === 'group' || room.kind === 'global') {
          const ids = [...members.values()].filter((item) => item.roomId === room.id).map((item) => item.userId);
          if (ids.length > 0 && (!room.turnUserId || !ids.includes(room.turnUserId))) {
            room.turnUserId = ids[randomInt(ids.length)] ?? ids[0];
            if (!room.turnOpensAt || room.turnOpensAt <= Date.now()) room.turnOpensAt = 0;
            room.turnRound = room.turnRound || 1;
          }
        }
        const roomMessages = messages.filter((message) => message.roomId === room.id).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        const lastMessage = roomMessages.at(-1) ?? null;
        const unreadCount = roomMessages.filter((message) => (
          message.senderId !== userId
          && !message.deleted
          && (member.lastReadAt === null || message.createdAt.getTime() > member.lastReadAt
            || (message.createdAt.getTime() === member.lastReadAt && message.id > (member.lastReadMessageId ?? '')))
        )).length;
        home.push({
          id: room.id,
          kind: room.kind,
          name: room.name,
          adminId: room.adminId,
          bio: room.bio,
          avatarUrl: room.avatarUrl,
          bannerUrl: room.bannerUrl,
          turnUserId: room.turnUserId,
          turnOpensAt: room.turnOpensAt ? new Date(room.turnOpensAt) : null,
          createdAt: new Date(room.createdAt),
          unreadCount,
          participantIds: [...members.values()].filter((item) => item.roomId === room.id).map((item) => item.userId).sort(),
          lastMessage,
        });
      }
      return home.sort((a, b) => (a.kind === 'global' ? -1 : b.kind === 'global' ? 1 : (b.lastMessage?.createdAt.getTime() ?? b.createdAt.getTime()) - (a.lastMessage?.createdAt.getTime() ?? a.createdAt.getTime())));
    },
    async listRoomMessages(roomId, userId, limit, page) {
      if (!members.has(memberKey(roomId, userId))) return null;
      const anchorId = page?.beforeId || page?.aroundId;
      const anchor = anchorId ? messages.find((message) => message.roomId === roomId && message.id === anchorId) : undefined;
      if (anchorId && !anchor) return [];
      const compare = (a: RoomMessage, b: RoomMessage) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
      return messages
        .filter((message) => message.roomId === roomId && (!anchor || compare(message, anchor) < 0 || (page?.aroundId && message.id === anchor.id)))
        .sort(compare)
        .slice(-limit);
    },
    async changeRoomMessage(roomId, userId, messageId, text, at) {
      if (!members.has(memberKey(roomId, userId))) return false;
      const message = messages.find((item) => item.roomId === roomId && item.id === messageId && item.senderId === userId);
      if (!message || message.event || (text !== null && (message.deleted || message.imageSize || message.fileBytes))) return false;
      if (text === null) {
        message.deleted = true;
        message.text = '';
        images.delete(messageId);
        files.delete(messageId);
        for (const [key, reaction] of reactions) if (reaction.messageId === messageId) reactions.delete(key);
      } else {
        message.text = text;
        message.editedAt = at;
      }
      return true;
    },
    async updateRoom(roomId, userId, patch, at) {
      const room = rooms.get(roomId);
      if (!room || (room.kind !== 'group' && room.kind !== 'global') || !members.has(memberKey(roomId, userId))) return false;
      const ids = [...members.values()].filter((item) => item.roomId === roomId).map((item) => item.userId);
      const round = room.turnRound || 1;
      const done = [...(passed.get(`${roomId}:${round}`) ?? [])];
      let holder = room.turnUserId ?? null;
      let opens = room.turnOpensAt ?? at.getTime();
      if (ids.length > 1 && (!holder || !ids.includes(holder))) {
        const pool = ids.filter((id) => !done.includes(id));
        const use = pool.length ? pool : ids;
        holder = use[randomInt(use.length)] ?? userId;
        opens = room.turnOpensAt && room.turnOpensAt > at.getTime() ? room.turnOpensAt : at.getTime();
      }
      const next = advanceGroupTurn({
        members: ids,
        holderId: holder,
        opensAt: opens,
        round,
        done,
        actorId: userId,
        now: at.getTime(),
        changedIdentity: patch.name !== undefined || patch.avatar !== undefined || patch.banner !== undefined,
        random: (length) => randomInt(length),
      });
      if (!next.ok) return false;
      if (patch.name !== undefined) room.name = patch.name;
      if (patch.bio !== undefined) room.bio = patch.bio;
      if (patch.avatar !== undefined) room.avatarUrl = patch.avatar;
      if (patch.banner !== undefined) room.bannerUrl = patch.banner;
      room.turnUserId = next.holderId;
      room.turnOpensAt = next.opensAt;
      room.turnRound = next.round;
      passed.set(`${roomId}:${next.round}`, new Set(next.done));
      return true;
    },
    async addRoomMessage(message, image, file) {
      if (!members.has(memberKey(message.roomId, message.senderId))) return 'missing';
      const existing = messages.find((item) => item.id === message.id);
      if (existing) {
        if (existing.roomId !== message.roomId || existing.senderId !== message.senderId) return 'invalid';
        if (image?.byteLength && !images.has(message.id)) {
          images.set(message.id, image);
          existing.imageSize = image.byteLength;
        }
        if (file?.bytes.byteLength && !files.has(message.id)) {
          files.set(message.id, file);
          existing.fileName = file.name;
          existing.fileBytes = file.bytes.byteLength;
        }
        return existing;
      }
      const replyToId = message.replyToId && messages.some((item) => item.id === message.replyToId && item.roomId === message.roomId) ? message.replyToId : null;
      const stored = {
        ...message,
        replyToId,
        imageSize: image?.byteLength ?? null,
        fileName: file?.name ?? null,
        fileBytes: file?.bytes.byteLength ?? null,
      };
      messages.push(stored);
      if (image?.byteLength) images.set(message.id, image);
      if (file?.bytes.byteLength) files.set(message.id, file);
      return stored;
    },
    async readMessageImage(roomId, userId, messageId) {
      if (!members.has(memberKey(roomId, userId))) return null;
      const message = messages.find((item) => item.id === messageId && item.roomId === roomId && !item.deleted);
      if (!message) return null;
      return images.get(messageId) ?? null;
    },
    async readMessageFile(roomId, userId, messageId) {
      if (!members.has(memberKey(roomId, userId))) return null;
      const message = messages.find((item) => item.id === messageId && item.roomId === roomId && !item.deleted);
      if (!message) return null;
      return files.get(messageId) ?? null;
    },
    async claimTurnNotice(roomId, holderId) {
      const room = rooms.get(roomId);
      if (!room || (room.kind !== 'group' && room.kind !== 'global') || room.turnUserId !== holderId) return false;
      const ids = [...members.values()].filter((item) => item.roomId === roomId).map((item) => item.userId);
      if (ids.length < 2 || !ids.includes(holderId) || room.turnNoticeFor === holderId) return false;
      room.turnNoticeFor = holderId;
      return true;
    },
    async notifyTurnHolder(message) {
      const user = users.get(message.senderId);
      if (!user || notices.some((notice) => notice.userId === message.senderId && notice.messageId === message.id && notice.kind === 'signal')) return;
      notices.push({
        userId: message.senderId,
        messageId: message.id,
        roomId: message.roomId,
        senderId: message.senderId,
        senderName: user.displayName,
        kind: 'signal',
        text: message.text,
        createdAt: message.createdAt,
        read: false,
      });
    },
    async notifyRoomMessage(message) {
      const parent = message.replyToId ? messages.find((item) => item.id === message.replyToId && item.roomId === message.roomId) : undefined;
      for (const member of members.values()) {
        if (member.roomId !== message.roomId || member.userId === message.senderId) continue;
        if (notices.some((notice) => notice.userId === member.userId && notice.messageId === message.id)) continue;
        const user = users.get(member.userId);
        const sender = users.get(message.senderId);
        if (!user || !sender) continue;
        notices.push({
          userId: member.userId,
          messageId: message.id,
          roomId: message.roomId,
          senderId: message.senderId,
          senderName: sender.displayName,
          kind: messageKind(message.text, user.username, parent?.senderId === member.userId),
          text: message.text,
          createdAt: message.createdAt,
          read: false,
        });
      }
    },
    async listNotifications(userId, limit, before) {
      const cleared = clearedAt.get(userId) ?? 0;
      const cut = before?.at.getTime();
      return notices
        .filter((notice) => {
          if (notice.userId !== userId || notice.createdAt.getTime() <= cleared) return false;
          if (cut === undefined || !before) return true;
          const time = notice.createdAt.getTime();
          return time < cut || (time === cut && notice.messageId < before.messageId);
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.messageId.localeCompare(a.messageId))
        .slice(0, limit)
        .map(({ userId: ownerId, ...notice }) => {
          const message = messages.find((item) => item.id === notice.messageId);
          const room = rooms.get(notice.roomId);
          const otherId = [...members.values()].find((member) => member.roomId === notice.roomId && member.userId !== ownerId)?.userId;
          const other = otherId ? users.get(otherId) : undefined;
          return {
            ...notice,
            text: message?.deleted ? '' : notice.kind === 'reaction' ? notice.text : message?.fileName ? message.fileName : message?.imageSize ? 'صورة' : notice.text,
            deleted: Boolean(message?.deleted),
            conversationName: room?.kind === 'private' ? (other?.displayName || 'محادثة خاصة') : (room?.name || 'ChatX'),
          };
        });
    },
    async countUnreadNotifications(userId) {
      const cleared = clearedAt.get(userId) ?? 0;
      return notices.filter((notice) => notice.userId === userId && !notice.read && notice.createdAt.getTime() > cleared).length;
    },
    async markNotificationsRead(userId, ids, now) {
      for (const notice of notices) {
        if (notice.userId !== userId || notice.read) continue;
        if (ids === 'all' || ids.includes(notice.messageId)) notice.read = true;
      }
      void now;
    },
    async clearNotifications(userId, now) {
      clearedAt.set(userId, now.getTime());
      for (const notice of notices) {
        if (notice.userId === userId) notice.read = true;
      }
    },
    async markRoomRead(roomId, userId, now, messageId) {
      const member = members.get(memberKey(roomId, userId));
      const target = messages.find((item) => item.roomId === roomId && item.id === messageId);
      if (!member || !target) return false;
      const current = messages.find((item) => item.id === member.lastReadMessageId);
      if (current && (current.createdAt > target.createdAt || (current.createdAt.getTime() === target.createdAt.getTime() && current.id >= target.id))) return true;
      member.lastReadAt = target.createdAt.getTime();
      member.lastReadMessageId = target.id;
      for (const notice of notices) {
        const message = messages.find((item) => item.id === notice.messageId);
        if (notice.userId === userId && notice.roomId === roomId && message && notice.kind !== 'reaction'
          && (message.createdAt < target.createdAt || (message.createdAt.getTime() === target.createdAt.getTime() && message.id <= target.id))) notice.read = true;
      }
      void now;
      return true;
    },
    async setReaction({ roomId, messageId, userId, emoji, at }) {
      if (!members.has(memberKey(roomId, userId))) return 'missing';
      const message = messages.find((item) => item.id === messageId && item.roomId === roomId && !item.deleted && !item.event);
      if (!message) return 'missing';
      const key = `${messageId}:${userId}`;
      if (emoji) reactions.set(key, { messageId, userId, emoji, createdAt: at.getTime() });
      else reactions.delete(key);
      if (message.senderId === userId) return 'ok';
      const index = notices.findIndex((notice) => notice.userId === message.senderId && notice.messageId === messageId && notice.kind === 'reaction');
      const publish = (actorId: string, glyph: string) => {
        const actor = users.get(actorId);
        const notice: Omit<InboxNotice, 'conversationName' | 'deleted'> & { userId: string } = {
          userId: message.senderId,
          messageId,
          roomId,
          senderId: actorId,
          senderName: actor?.displayName ?? '',
          kind: 'reaction',
          text: glyph,
          createdAt: at,
          read: false,
        };
        if (index >= 0) notices[index] = notice;
        else notices.push(notice);
      };
      if (emoji) {
        publish(userId, emoji);
        return 'ok';
      }
      if (index < 0 || notices[index]?.senderId !== userId) return 'ok';
      const latest = [...reactions.values()]
        .filter((item) => item.messageId === messageId && item.userId !== message.senderId)
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      if (!latest) {
        notices.splice(index, 1);
        return 'ok';
      }
      publish(latest.userId, latest.emoji);
      return 'ok';
    },
    async listReactions(roomId, messageIds) {
      const ids = new Set(messages.filter((item) => item.roomId === roomId && !item.deleted && (!messageIds || messageIds.includes(item.id))).map((item) => item.id));
      return [...reactions.values()].filter((item) => ids.has(item.messageId)).map(({ messageId, userId, emoji }) => ({ messageId, userId, emoji }));
    },
    async createRoom({ id, kind, name, creatorId, memberIds, at }) {
      const creator = users.get(creatorId);
      if (!creator || creator.role !== 'member') return 'invalid';
      const others = [...new Set(memberIds)].filter((userId) => userId !== creatorId);
      if (others.some((userId) => users.get(userId)?.role !== 'member')) return 'invalid';
      if (kind === 'private') {
        if (others.length !== 1) return 'invalid';
        const pairKey = [creatorId, others[0]].sort().join(':');
        const existing = [...rooms.values()].find((room) => room.pairKey === pairKey);
        if (existing) return existing.id;
        rooms.set(id, { id, kind, name: null, createdAt: at.getTime(), pairKey });
        for (const userId of [creatorId, others[0]]) {
          members.set(memberKey(id, userId), { roomId: id, userId, lastReadAt: null, lastReadMessageId: null });
        }
        return id;
      }
      if (others.length < 2 || others.length > 20 || !name) return 'invalid';
      const ids = [creatorId, ...others];
      rooms.set(id, {
        id,
        kind,
        name,
        createdAt: at.getTime(),
        pairKey: null,
        adminId: creatorId,
        turnUserId: ids[randomInt(ids.length)],
        turnOpensAt: at.getTime(),
        turnRound: 1,
      });
      for (const userId of [creatorId, ...others]) {
        members.set(memberKey(id, userId), { roomId: id, userId, lastReadAt: null, lastReadMessageId: null });
      }
      return id;
    },
    async listSaved(userId, limit, beforeId): Promise<SavedItem[]> {
      const items: SavedItem[] = [];
      for (const [key, savedAt] of saved) {
        if (!key.startsWith(`${userId}:`)) continue;
        const messageId = key.slice(userId.length + 1);
        const message = messages.find((item) => item.id === messageId && !item.deleted);
        if (!message || !members.has(memberKey(message.roomId, userId))) continue;
        const room = rooms.get(message.roomId);
        const sender = users.get(message.senderId);
        if (!room || !sender) continue;
        const otherId = [...members.values()].find((member) => member.roomId === room.id && member.userId !== userId)?.userId;
        const other = otherId ? users.get(otherId) : undefined;
        items.push({
          messageId,
          roomId: room.id,
          conversationName: room.kind === 'private' ? (other?.displayName || 'محادثة خاصة') : (room.name || 'ChatX'),
          senderId: sender.id,
          senderName: sender.displayName,
          text: message.fileName ? message.fileName : message.imageSize && !message.text ? 'صورة' : message.text,
          createdAt: message.createdAt,
          savedAt: new Date(savedAt),
        });
      }
      const ordered = items.sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime() || b.messageId.localeCompare(a.messageId));
      const index = beforeId ? ordered.findIndex((item) => item.messageId === beforeId) : -1;
      return beforeId && index < 0 ? [] : ordered.slice(index + 1, index + 1 + limit);
    },
    async setSaved(userId, messageId, keep, at) {
      const message = messages.find((item) => item.id === messageId && !item.deleted);
      if (!message || !members.has(memberKey(message.roomId, userId))) return 'missing';
      const key = `${userId}:${messageId}`;
      if (keep) saved.set(key, at.getTime());
      else saved.delete(key);
      return 'ok';
    },
    async listReaders(roomId): Promise<RoomReader[]> {
      return [...members.values()]
        .filter((member) => member.roomId === roomId && member.lastReadMessageId && member.lastReadAt !== null)
        .map((member) => ({
          userId: member.userId,
          messageId: member.lastReadMessageId as string,
          readAt: new Date(member.lastReadAt as number),
        }));
    },
    async listPresence(now) {
      return [...users.values()].filter((user) => user.role === 'member').map((user) => {
        let best: { lastSeenAt: number; presence: 'online' | 'away' } | null = null;
        for (const session of sessions.values()) {
          if (session.userId !== user.id || session.expiresAt <= now.getTime() || session.lastSeenAt <= 0) continue;
          if (!best || session.lastSeenAt > best.lastSeenAt) best = session;
        }
        return {
          id: user.id,
          presence: best?.presence ?? null,
          lastSeenAt: best ? new Date(best.lastSeenAt) : null,
        };
      });
    },
  };
}
