import { useEffect, useMemo, useState } from 'react';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonToolbar,
} from '@ionic/react';
import { chevronDownOutline, createOutline, notificationsOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import Avatar from '../components/common/Avatar';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import EmptyState from '../components/common/EmptyState';
import PageSkeleton from '../components/common/PageSkeleton';
import ConversationItem from '../components/conversations/ConversationItem';
import MuteSheet from '../components/conversations/MuteSheet';
import {
  conversationTitle,
  formatConversationTime,
  isGlobalConversation,
  lastMessageOf,
  membersOf,
  otherParticipant,
  recentConversations,
  roomSummary,
} from '../lib/conversation';
import { formatInboxBadge, groupNotifications, inboxBadgeCount } from '../lib/inbox';
import { connectionLabel, getUserPresence } from '../lib/presence';
import { isServerId } from '../lib/home';
import { startPolling } from '../lib/poll';
import { brandName, textDirection } from '../lib/appearance';
import { messagePreview } from '../lib/media';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useSavedStore } from '../stores/savedStore';
import { notifyLevel, useMuteStore, type ChatMute } from '../stores/muteStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useUserStore } from '../stores/userStore';
import type { Conversation, ConversationType } from '../types/conversation';

type Filter = 'all' | Extract<ConversationType, 'private' | 'group'>;

export default function HomePage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const users = useUserStore((state) => state.users);
  const conversations = useChatStore((state) => state.conversations);
  const loadHome = useChatStore((state) => state.loadHome);
  const serverUnread = useChatStore((state) => state.serverUnread);
  const messages = useChatStore((state) => state.messages);
  const mutes = useMuteStore((state) => state.mutes);
  const [filter, setFilter] = useState<Filter>('all');
  const [muteTarget, setMuteTarget] = useState<Conversation>();
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const serverAccount = isServerId(currentUser.id);

  useEffect(() => {
    let alive = true;
    if (!serverAccount) {
      const timer = window.setTimeout(() => setReady(true), 280);
      return () => window.clearTimeout(timer);
    }
    if (navigator.onLine === false) {
      setReady(true);
      setNotice('تعذر الاتصال.');
    }
    const run = async (silent: boolean) => {
      if (!silent) setReady(useChatStore.getState().conversations.length > 0);
      const result = await loadHome();
      if (!silent) {
        await useSavedStore.getState().load().catch(() => undefined);
      }
      if (!alive) return;
      if (result === 'offline') setNotice('تعذر الاتصال.');
      else if (result === 'invalid') setNotice('تعذر تحميل المحادثات.');
      else setNotice('');
      setReady(true);
    };
    let first = true;
    const stop = startPolling(async () => {
      const silent = !first;
      first = false;
      await run(silent);
    }, { active: () => window.location.pathname === '/home', economy: true });
    return () => {
      alive = false;
      stop();
    };
  }, [loadHome, serverAccount]);

  const globalChat = conversations.find((conversation) => isGlobalConversation(conversation));
  const visible = useMemo(() => {
    const list = conversations.filter((conversation) => {
      if (isGlobalConversation(conversation)) return false;
      if (filter === 'private') return conversation.type === 'private';
      if (filter === 'group') return conversation.type === 'group';
      return true;
    });
    return recentConversations(list, messages);
  }, [conversations, filter, messages]);
  const showGlobal = Boolean(globalChat) && filter !== 'private';
  const inboxClearedAt = useChatStore((state) => state.inboxClearedAt);
  const inboxReadIds = useChatStore((state) => state.inboxReadIds);
  const notifyTypes = useSettingsStore((state) => state.notifyTypes);
  const brandTitle = useSettingsStore((state) => state.appearance.name);
  const brandLogo = useSettingsStore((state) => state.appearance.logo);
  const inboxCount = useMemo(
    () => serverAccount
      ? serverUnread
      : inboxBadgeCount(groupNotifications(conversations, messages, currentUser.id, currentUser.username, mutes, inboxClearedAt, inboxReadIds, notifyTypes)),
    [conversations, currentUser.id, currentUser.username, inboxClearedAt, inboxReadIds, messages, mutes, notifyTypes, serverAccount, serverUnread],
  );
  const inboxBadge = formatInboxBadge(inboxCount);
  const presence = getUserPresence(currentUser.id, users);

  const renderConversation = (conversation: Conversation) => {
    const last = lastMessageOf(conversation, messages);
    const other = conversation.type === 'private' ? otherParticipant(conversation, currentUser.id, users) : undefined;
    const people = conversation.type === 'private' ? [] : membersOf(conversation, users);
    const online = people.filter((user) => user.status === 'online').length;
    return (
      <ConversationItem
        key={conversation.id}
        title={conversationTitle(conversation, currentUser.id, users)}
        color={other?.color ?? '#3d9b84'}
        photo={conversation.type === 'private' ? other?.avatarUrl : conversation.avatarUrl}
        preview={messagePreview(last, last?.senderId === currentUser.id)}
        deleted={Boolean(last?.deletedForEveryone)}
        time={last ? formatConversationTime(last.createdAt) : undefined}
        unread={conversation.unreadCount}
        type={conversation.type}
        detail={people.length > 0 ? roomSummary(people.length, online) : undefined}
        muted={muteHint(conversation.id, mutes)}
        onClick={() => navigate(`/chat/${conversation.id}`)}
        onHold={() => setMuteTarget(conversation)}
      />
    );
  };

  return (
    <IonPage>
      <IonHeader>
        <NetworkStatusBanner />
        <IonToolbar className="home-toolbar">
          <div className="home-nav" dir={textDirection(brandName(brandTitle))}>
            <div className="home-nav-brand" dir={textDirection(brandName(brandTitle))}>
              <img src={brandLogo || '/assets/icon/icon.png'} alt="" width="32" height="32" decoding="async" />
              <strong dir="auto">{brandName(brandTitle)}</strong>
            </div>
            <div className="home-nav-actions">
              <button type="button" className="home-nav-new" aria-label="محادثة جديدة" onClick={() => navigate('/new')}>
                <IonIcon icon={createOutline} />
              </button>
            </div>
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent className="home-scroll">
        {!ready ? (
          <PageSkeleton kind="home" />
        ) : (
          <>
          {notice ? <p className="form-error account-notice">{notice}</p> : null}
          <IonSegment className="home-filters" value={filter} onIonChange={(event) => setFilter((event.detail.value as Filter) || 'all')}>
            <IonSegmentButton value="all">
              <IonLabel>الكل</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="private">
              <IonLabel>الخاص</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="group">
              <IonLabel>المجموعات</IonLabel>
            </IonSegmentButton>
          </IonSegment>
          {showGlobal && globalChat && (
            <section className="home-section">
              <h2>المجموعة الرئيسية</h2>
              {renderConversation(globalChat)}
            </section>
          )}
          {visible.length === 0 && !showGlobal ? (
            <EmptyState title="لا توجد محادثات حتى الآن" />
          ) : visible.length > 0 ? (
            <section className="home-section">
              {showGlobal && <h2>المحادثات الأخيرة</h2>}
              <div className="home-list">
                {visible.map((conversation) => renderConversation(conversation))}
              </div>
            </section>
          ) : null}
          </>
        )}
      </IonContent>
      <div className="user-dock">
        <button type="button" className="user-dock-main" onClick={() => navigate('/account')}>
          <span className="user-dock-avatar">
            <Avatar name={currentUser.displayName} color={currentUser.color} size={46} src={currentUser.avatarUrl} />
            <i className={presence === 'online' ? 'on' : ''} />
          </span>
          <span className="user-dock-copy">
            <strong>
              <span>{currentUser.displayName}</span>
              <IonIcon icon={chevronDownOutline} />
            </strong>
            <em>{connectionLabel(currentUser, { self: true })}</em>
          </span>
        </button>
        <button type="button" className="user-dock-bell" aria-label={inboxBadge ? `الإشعارات، ${inboxBadge} غير مقروءة` : 'الإشعارات'} onClick={() => navigate('/notifications')}>
          <IonIcon icon={notificationsOutline} />
          {inboxBadge && <span className="dock-badge">{inboxBadge}</span>}
        </button>
      </div>
      {muteTarget && (
        <MuteSheet
          conversation={muteTarget}
          title={conversationTitle(muteTarget, currentUser.id, users)}
          onClose={() => setMuteTarget(undefined)}
        />
      )}
    </IonPage>
  );
}

function muteHint(conversationId: string, mutes: ChatMute[]) {
  const level = notifyLevel(mutes, conversationId);
  if (level === 'none') return 'بدون إشعارات';
  if (level === 'mentions') return '@ فقط';
  if (level === 'everyone') return '@everyone';
  if (level === 'custom') return 'مخصص';
  return undefined;
}
