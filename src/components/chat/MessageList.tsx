import { Fragment, memo, useEffect, useMemo, useState } from 'react';
import { IonButton } from '@ionic/react';
import { MESSAGE_PAGE_SIZE } from '../../constants/chat';
import { formatMessageDay, unreadDividerLabel, unreadOnScreen, unreadStart } from '../../lib/conversation';
import { facesOnMessage, hasSeenMessage, seenAtFor, type ReceiptRow } from '../../lib/readReceipts';
import { useChatStore } from '../../stores/chatStore';
import MessageBubble from './MessageBubble';
import type { Message } from '../../types/message';
import type { User } from '../../types/user';

const NO_SEEN: User[] = [];
const NO_ROWS: ReceiptRow[] = [];
const EMPTY_CURSOR: Record<string, string> = {};

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
  const [offset, setOffset] = useState(0);
  const cursor = useChatStore((state) => state.readCursors[conversationId] ?? EMPTY_CURSOR);
  const readAt = useChatStore((state) => state.readTimes[conversationId] ?? EMPTY_CURSOR);
  const available = useMemo(() => messages.slice(-Math.max(limit, MESSAGE_PAGE_SIZE)), [limit, messages]);
  const visible = useMemo(() => available.slice(offset, offset + 120), [available, offset]);
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
          const seen = hasSeenMessage(cursor[userId], messages, message.id);
          return [{ user, seen, seenAt: seen ? seenAtFor(cursor[userId], readAt[userId], messages, message.id) : undefined }];
        }),
      );
    }
    return grouped;
  }, [authors, cursor, currentUserId, direct, group, memberIds, messages, readAt, visible]);

  useEffect(() => { setOffset(0); }, [conversationId, limit]);
  useEffect(() => {
    const index = available.findIndex((message) => message.id === spotlightId);
    if (index >= 0) setOffset(Math.max(0, index - 60));
  }, [available, spotlightId]);

  const load = async () => {
    if (loadingOlder) return;
    setLoadingOlder(true);
    try { await onLoadOlder(); setOffset(0); }
    finally { setLoadingOlder(false); }
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
              <p id={`msg-${message.id}`} className="chat-event" dir="auto">{message.text}</p>
            ) : (
            <MessageBubble
              message={message}
              mine={message.senderId === currentUserId}
              showAuthor={showAuthor}
              group={group}
              direct={direct}
              directSeen={Boolean(direct && otherId && hasSeenMessage(cursor[otherId], messages, message.id))}
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
      {offset + 120 < available.length && <IonButton fill="clear" expand="block" onClick={() => setOffset(Math.min(offset + 90, available.length - 120))}>رسائل أحدث</IonButton>}
      {offset > 0 && <IonButton fill="clear" expand="block" onClick={() => setOffset(Math.max(0, offset - 90))}>رسائل أقدم في الصفحة</IonButton>}
    </>
  );
}

export default memo(MessageList);
