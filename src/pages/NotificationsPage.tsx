import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IonContent, IonHeader, IonIcon, IonPage, IonRefresher, IonRefresherContent } from '@ionic/react';
import { alertOutline, arrowUndoOutline, atOutline, chatbubbleOutline, checkmarkDoneOutline, heartOutline, notificationsOffOutline, peopleOutline, trashOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import Avatar from '../components/common/Avatar';
import EmptyState from '../components/common/EmptyState';
import EmojiText from '../components/common/EmojiText';
import PageSkeleton from '../components/common/PageSkeleton';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import PageNav from '../components/common/PageNav';
import { NOTIFICATIONS_PAGE_SIZE } from '../constants/chat';
import { conversationTitle, formatNotificationTime } from '../lib/conversation';
import { groupNotifications, notificationPresentation, presentInbox, resolveMessageFocus, type InboxItem, type InboxKind } from '../lib/inbox';
import { isServerId } from '../lib/home';
import { recalledInboxFilter, recalledInboxScroll, rememberInboxFilter, rememberInboxScroll } from '../lib/inboxSession';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useMuteStore } from '../stores/muteStore';
import { useNetworkStore } from '../stores/networkStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useUserStore } from '../stores/userStore';

const FILTERS: { id: 'all' | InboxKind; label: string; ltr?: boolean }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'mention', label: 'الإشارات' },
  { id: 'everyone', label: '@everyone', ltr: true },
  { id: 'reply', label: 'الردود' },
  { id: 'signal', label: 'التنبيهات' },
  { id: 'message', label: 'الرسائل' },
  { id: 'reaction', label: 'التفاعلات' },
];

const KIND_ICON = {
  mention: atOutline,
  reply: arrowUndoOutline,
  everyone: peopleOutline,
  signal: alertOutline,
  message: chatbubbleOutline,
  reaction: heartOutline,
} as const;

const NotificationRow = memo(function NotificationRow({
  item,
  name,
  color,
  photo,
  room,
  onOpen,
}: {
  item: InboxItem;
  name: string;
  color: string;
  photo?: string;
  room: string;
  onOpen: (item: InboxItem) => void;
}) {
  const look = notificationPresentation(item.kind);
  const label = `${name}، ${room}، ${look.label}${item.suppressed ? '، مكتوم' : ''}${item.unread ? '، غير مقروء' : ''}`;
  return (
    <button
      type="button"
      className={['inbox-row', item.unread ? 'is-unread' : 'is-read', item.suppressed ? 'is-muted' : '', `is-${look.tone}`].filter(Boolean).join(' ')}
      aria-label={label}
      onClick={() => onOpen(item)}
    >
      <Avatar name={name} color={color} size={44} src={photo} />
      <span className="inbox-copy">
        <span className="inbox-line">
          <strong dir="auto">{name}</strong>
          <em>{formatNotificationTime(item.createdAt)}</em>
        </span>
        <span className="inbox-meta">
          <span dir="auto">{room}</span>
          <span className="kind-pill" dir={look.ltr ? 'ltr' : undefined}>
            <IonIcon icon={KIND_ICON[item.kind]} />
            {look.label}
          </span>
          {item.count > 1 && <span className="kind-pill quiet">{item.count}</span>}
          {item.suppressed && (
            <span className="kind-pill quiet">
              <IonIcon icon={notificationsOffOutline} />
              مكتوم
            </span>
          )}
        </span>
        <span className="inbox-preview" dir="auto"><EmojiText text={item.count > 1 ? `${item.count} رسائل · ${item.preview}` : item.preview} /></span>
      </span>
    </button>
  );
});

export default function NotificationsPage() {
  const navigate = useNavigate();
  const contentRef = useRef<HTMLIonContentElement>(null);
  const currentUser = useAuthStore((state) => state.currentUser);
  const users = useUserStore((state) => state.users);
  const conversations = useChatStore((state) => state.conversations);
  const messages = useChatStore((state) => state.messages);
  const inboxClearedAt = useChatStore((state) => state.inboxClearedAt);
  const readIds = useChatStore((state) => state.inboxReadIds);
  const serverInbox = useChatStore((state) => state.serverInbox);
  const inboxHasMore = useChatStore((state) => state.inboxHasMore);
  const loadInbox = useChatStore((state) => state.loadInbox);
  const markAllRead = useChatStore((state) => state.markAllRead);
  const markNotificationsRead = useChatStore((state) => state.markNotificationsRead);
  const clearInbox = useChatStore((state) => state.clearInbox);
  const mutes = useMuteStore((state) => state.mutes);
  const notifyTypes = useSettingsStore((state) => state.notifyTypes);
  const offline = useNetworkStore((state) => state.network === 'offline');
  const [filter, setFilter] = useState(recalledInboxFilter);
  const [pages, setPages] = useState(1);
  const [confirmClear, setConfirmClear] = useState(false);
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(!isServerId(useAuthStore.getState().currentUser.id) || useChatStore.getState().serverInbox.length > 0);
  const serverAccount = isServerId(currentUser.id);

  useEffect(() => {
    const top = recalledInboxScroll();
    if (top <= 0) return;
    const timer = window.setTimeout(() => void contentRef.current?.scrollToPoint(0, top, 0), 40);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!serverAccount) return;
    let alive = true;
    const run = async () => {
      try {
        const result = await loadInbox();
        if (!alive) return;
        if (result === 'offline') setNotice('تعذر الاتصال.');
        else if (result === 'invalid') setNotice('تعذر تحميل الإشعارات.');
        else setNotice('');
      } finally {
        if (alive) setReady(true);
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [loadInbox, serverAccount]);

  const items = useMemo(
    () => serverAccount
      ? presentInbox(serverInbox, mutes, notifyTypes)
      : groupNotifications(conversations, messages, currentUser.id, currentUser.username, mutes, inboxClearedAt, readIds, notifyTypes),
    [conversations, currentUser.id, currentUser.username, inboxClearedAt, messages, mutes, notifyTypes, readIds, serverAccount, serverInbox],
  );
  const visible = filter === 'all' ? items : items.filter((item) => item.kind === filter);
  const shown = visible.slice(0, pages * NOTIFICATIONS_PAGE_SIZE);
  const unread = items.some((item) => item.unread);

  const choose = (next: (typeof FILTERS)[number]['id']) => {
    setFilter(next);
    setPages(1);
    rememberInboxFilter(next);
  };

  const open = (item: InboxItem) => {
    markNotificationsRead(item.ids);
    if (isServerId(item.conversationId)) {
      navigate(`/chat/${item.conversationId}?at=${item.id}`);
      return;
    }
    const focus = resolveMessageFocus(messages, item.conversationId, item.id);
    navigate(focus === 'missing' ? `/chat/${item.conversationId}?missing=1` : `/chat/${item.conversationId}?at=${item.id}`);
  };

  return (
    <IonPage>
      <IonHeader>
        <NetworkStatusBanner />
        <PageNav title="الإشعارات" fallback="/home" />
      </IonHeader>
      <IonContent
        ref={contentRef}
        className="inbox-page"
        scrollEvents
        onIonScroll={(event) => rememberInboxScroll(event.detail.scrollTop)}
      >
        <IonRefresher slot="fixed" onIonRefresh={(event) => {
          const finish = () => event.detail.complete();
          if (!serverAccount) {
            window.setTimeout(finish, 400);
            return;
          }
          void loadInbox().finally(finish);
        }}>
          <IonRefresherContent pullingText="جارٍ التحديث" refreshingText="جارٍ التحديث" />
        </IonRefresher>
        <div className="inbox-tools">
          <p className="inbox-lead">كل الإشعارات تظهر هنا، حتى لو كان النوع أو المحادثة مكتومين.</p>
          <div className="inbox-actions">
            <button
              type="button"
              aria-label="قراءة الكل"
              disabled={!unread}
              onClick={() => {
                markAllRead();
              }}
            >
              <IonIcon icon={checkmarkDoneOutline} />
            </button>
            <button type="button" className="danger" aria-label="حذف الكل" disabled={items.length === 0} onClick={() => setConfirmClear(true)}>
              <IonIcon icon={trashOutline} />
            </button>
          </div>
        </div>
        {notice ? <p className="form-error account-notice">{notice}</p> : null}
        {offline && <p className="inbox-offline" role="status">أنت غير متصل</p>}
        {!ready ? (
          <PageSkeleton kind="notices" />
        ) : (
        <>
        <div className="inbox-filters" role="tablist" aria-label="أنواع الإشعارات">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              dir={item.ltr ? 'ltr' : undefined}
              aria-selected={filter === item.id}
              className={filter === item.id ? 'is-on' : undefined}
              onClick={() => choose(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <EmptyState
            title={items.length === 0 ? 'لا توجد إشعارات' : 'لا توجد إشعارات من هذا النوع'}
            detail={items.length === 0 ? 'ستظهر هنا رسائل المجموعات بمجرد وصولها.' : undefined}
          />
        ) : (
          <div className="inbox-list">
            {shown.map((item) => {
              const conversation = conversations.find((room) => room.id === item.conversationId);
              const sender = users.find((user) => user.id === item.senderId);
              return (
                <NotificationRow
                  key={`${item.kind}-${item.id}`}
                  item={item}
                  name={item.senderName || sender?.displayName || 'مستخدم غير متاح'}
                  color={sender?.color ?? '#6f8f72'}
                  photo={sender?.avatarUrl}
                  room={item.conversationName || (conversation ? conversationTitle(conversation, currentUser.id, users) : 'محادثة')}
                  onOpen={open}
                />
              );
            })}
            {(shown.length < visible.length || (serverAccount && inboxHasMore)) && (
              <button
                type="button"
                className="inbox-more"
                onClick={() => {
                  if (shown.length < visible.length) {
                    setPages((count) => count + 1);
                    return;
                  }
                  const oldest = [...serverInbox].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
                  if (oldest) void loadInbox({ at: oldest.createdAt, id: oldest.id });
                }}
              >
                عرض المزيد
              </button>
            )}
          </div>
        )}
        </>
        )}
      </IonContent>
      {confirmClear &&
        createPortal(
          <div className="wa-scrim center" onClick={() => setConfirmClear(false)}>
            <div className="account-dialog" role="alertdialog" aria-labelledby="clear-inbox-title" onClick={(event) => event.stopPropagation()}>
              <h2 id="clear-inbox-title">حذف كل الإشعارات؟</h2>
              <p className="account-warn">ستختفي الإشعارات الحالية. الرسائل في المحادثات تبقى.</p>
              <div className="account-actions">
                <button type="button" onClick={() => setConfirmClear(false)}>إلغاء</button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    clearInbox();
                    setConfirmClear(false);
                  }}
                >
                  حذف
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </IonPage>
  );
}
