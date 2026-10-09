import { Fragment, memo, useEffect, useMemo, useState } from 'react';
import { IonButton } from '@ionic/react';
import { MESSAGE_PAGE_SIZE } from '../../constants/chat';
import { formatMessageDay, unreadDividerLabel, unreadOnScreen, unreadStart } from '../../lib/conversation';
import { facesOnMessage, type ReceiptRow } from '../../lib/readReceipts';
import { useChatStore } from '../../stores/chatStore';
import MessageBubble from './MessageBubble';
import EmojiText from '../common/EmojiText';
import type { Message } from '../../types/message';
import type { User } from '../../types/user';

const WINDOW = 48;
const NO_SEEN: User[] = [];
const NO_ROWS: ReceiptRow[] = [];
const EMPTY_CURSOR: Record<string, string> = {};

function cursorSees(cursorId: string | undefined, byId: Map<string, Message>, message: Message) {
  if (!cursorId) return false;
  if (cursorId === message.id) return true;
  const cursor = byId.get(cursorId);
  if (!cursor || cursor.conversationId !== message.conversationId) return false;
  return cursor.createdAt > message.createdAt || (cursor.createdAt === message.createdAt && cursor.id >= message.id);
}

type MessageListProps = {
  messages: Message[];
  limit: number;
  showAuthor: boolean;
  group?: boolean;
  direct?: boolean;
  conversationId: string;
  memberIds: string[];
  users: User[];
  currentUserId: string;
  unreadCount?: number;
  spotlightId?: string;
  filtered?: boolean;
  hasMore?: boolean;
  onOpenProfile?: (user: User) => void;
  onLoadOlder: () => Promise<boolean>;
};

function MessageList({ messages, limit, showAuthor, group = false, direct = false, conversationId, memberIds, users, currentUserId, unreadCount = 0, spotlightId = '', filtered = false, hasMore = false, onOpenProfile, onLoadOlder }: MessageListProps) {
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [back, setBack] = useState(0);
  const cursor = useChatStore((state) => state.readCursors[conversationId] ?? EMPTY_CURSOR);
  const readAt = useChatStore((state) => state.readTimes[conversationId] ?? EMPTY_CURSOR);
  const tail = useMemo(() => messages.slice(-Math.max(limit, MESSAGE_PAGE_SIZE)), [limit, messages]);
  const visible = useMemo(() => {
    if (filtered) return tail;
    return tail.slice(-Math.min(tail.length, WINDOW + back));
  }, [back, filtered, tail]);
  const byId = useMemo(() => {
    const map = new Map<string, Message>();
    for (const message of messages) map.set(message.id, message);
    return map;
  }, [messages]);
  const onScreen = unreadOnScreen(unreadCount, messages.length, visible.length);
  const unreadAt = unreadStart(visible.length, onScreen);
  const authors = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const otherId = memberIds.find((userId) => userId !== currentUserId);
  const receiptByMessage = useMemo(() => {
    const grouped = new Map<string, ReceiptRow[]>();
    if (!group && !direct) return grouped;
    const others = memberIds.filter((userId) => userId !== currentUserId);
    for (const message of visible) {
      if (message.senderId !== currentUserId || message.deletedForEveryone) continue;
      grouped.set(
        message.id,
        others.flatMap((userId) => {
          const user = authors.get(userId);
          if (!user) return [];
          const seen = cursorSees(cursor[userId], byId, message);
          const seenAt = seen ? readAt[userId] ?? byId.get(cursor[userId] ?? '')?.createdAt : undefined;
          return [{ user, seen, seenAt }];
        }),
      );
    }
    return grouped;
  }, [authors, byId, cursor, currentUserId, direct, group, memberIds, readAt, visible]);

  useEffect(() => { setBack(0); }, [conversationId]);
  useEffect(() => {
    if (!spotlightId || filtered) return;
    const index = tail.findIndex((message) => message.id === spotlightId);
    if (index < 0) return;
    const fromEnd = tail.length - index;
    if (fromEnd > WINDOW) setBack((value) => Math.max(value, fromEnd - WINDOW));
  }, [filtered, spotlightId, tail]);

  const load = async () => {
    if (loadingOlder) return;
    setLoadingOlder(true);
    try {
      setBack((value) => value + MESSAGE_PAGE_SIZE);
      await onLoadOlder();
    } finally { setLoadingOlder(false); }
  };

  return (
    <>
      {!filtered && (messages.length > limit || hasMore) && (
        <IonButton fill="clear" size="small" expand="block" disabled={loadingOlder} onClick={() => void load()}>
          {loadingOlder ? 'جارٍ التحميل' : 'تحميل رسائل أقدم'}
        </IonButton>
      )}
      {!filtered && loadingOlder && <div className="skeleton-line" />}
      {visible.map((message, index) => {
        const day = formatMessageDay(message.createdAt);
        const previous = index > 0 ? formatMessageDay(visible[index - 1].createdAt) : '';
        const faces = group ? facesOnMessage(cursor, message, currentUserId, authors) : NO_SEEN;
        return (
          <Fragment key={message.id}>
            {day !== previous && <p className="chat-day">{day}</p>}
            {!filtered && index === unreadAt && <p id="unread-anchor" className="unread-divider">{unreadDividerLabel(onScreen)}</p>}
            {message.event ? (
              <p id={`msg-${message.id}`} className="chat-event" dir="auto"><EmojiText text={message.text ?? ''} /></p>
            ) : (
            <MessageBubble
              message={message}
              mine={message.senderId === currentUserId}
              showAuthor={showAuthor}
              group={group}
              direct={direct}
              directSeen={Boolean(direct && otherId && cursorSees(cursor[otherId], byId, message))}
              seenHere={faces.length ? faces : NO_SEEN}
              receiptRows={receiptByMessage.get(message.id) ?? NO_ROWS}
              author={authors.get(message.senderId)}
              spotlight={message.id === spotlightId}
              onOpenProfile={onOpenProfile}
            />
            )}
          </Fragment>
        );
      })}
    </>
  );
}

export default memo(MessageList);
