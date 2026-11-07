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
import PermissionDialog from '../components/common/PermissionDialog';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import EmptyState from '../components/common/EmptyState';
import PageSkeleton from '../components/common/PageSkeleton';
import ConversationItem from '../components/conversations/ConversationItem';
import MuteSheet from '../components/conversations/MuteSheet';
import {
  conversationTitle,
  deletedPrivatePeer,
  isSelfChat,
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
import { isIncomingRequest } from '../lib/friends';
import { isServerId } from '../lib/home';
import { startPolling } from '../lib/poll';
import { brandName, textDirection } from '../lib/appearance';
import { messagePreview } from '../lib/media';
import { t, useI18n } from '../lib/i18n';
import { useAuthStore } from '../stores/authStore';
import { connectionLost } from '../stores/networkStore';
import { useChatStore } from '../stores/chatStore';
import { useSavedStore } from '../stores/savedStore';
import { notifyLevel, useMuteStore, type ChatMute } from '../stores/muteStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useUserStore } from '../stores/userStore';
import HomeStressBar from '../dev/HomeStressBar';
import { homeStressPack, useHomeStress } from '../dev/homeStress';
import type { Conversation, ConversationType } from '../types/conversation';

type Filter = 'all' | Extract<ConversationType, 'private' | 'group'>;

export default function HomePage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const currentUser = useAuthStore((state) => state.currentUser);
  const storedUsers = useUserStore((state) => state.users);
  const storedConversations = useChatStore((state) => state.conversations);
  const stress = useHomeStress();
  const stressPack = homeStressPack(stress.mode, currentUser.id);
  const users = stressPack ? [...stressPack.users, ...storedUsers] : storedUsers;
  const conversations = stressPack?.conversations ?? storedConversations;
  const loadHome = useChatStore((state) => state.loadHome);
  const changeFriend = useChatStore((state) => state.changeFriend);
  const withdrawPrivate = useChatStore((state) => state.withdrawPrivate);
  const serverUnread = useChatStore((state) => state.serverUnread);
  const storedMessages = useChatStore((state) => state.messages);
  const messages = stressPack ? stressPack.messages : storedMessages;
  const mutes = useMuteStore((state) => state.mutes);
  const [filter, setFilter] = useState<Filter>('all');
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [waitingOpen, setWaitingOpen] = useState(false);
  const [muteTarget, setMuteTarget] = useState<Conversation>();
  const [removeTarget, setRemoveTarget] = useState<Conversation>();
  const dismissDeletedChat = useChatStore((state) => state.dismissDeletedChat);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const serverAccount = isServerId(currentUser.id);

  useEffect(() => {
    let alive = true;
    if (!serverAccount) {
      const timer = window.setTimeout(() => setReady(true), 280);
      return () => window.clearTimeout(timer);
    }
    if (connectionLost()) {
      setReady(true);
      setNotice(t('home.loadOffline'));
    }
    const run = async (silent: boolean) => {
      if (!silent) setReady(useChatStore.getState().conversations.length > 0);
      const result = await loadHome();
      if (!silent) {
        await useSavedStore.getState().load().catch(() => undefined);
      }
      if (!alive) return;
      if (result === 'offline') setNotice(connectionLost() ? t('home.loadOffline') : '');
      else if (result === 'invalid') setNotice(t('home.loadInvalid'));
      else {
        setNotice('');
        if (!useChatStore.getState().conversations.some((room) => room.self)) {
          await useChatStore.getState().openPrivate(useAuthStore.getState().currentUser.id);
        }
      }
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
  }, [loadHome, serverAccount, t]);

  const globalChat = conversations.find((conversation) => isGlobalConversation(conversation) && conversation.participantIds.includes(currentUser.id));
  const visible = useMemo(() => {
    const list = conversations.filter((conversation) => {
      if (isGlobalConversation(conversation)) return false;
      if (filter === 'private') return conversation.type === 'private';
      if (filter === 'group') return conversation.type === 'group';
      return true;
    });
    const sorted = recentConversations(list, messages);
    return [...sorted.filter((conversation) => isSelfChat(conversation)), ...sorted.filter((conversation) => !isSelfChat(conversation))];
  }, [conversations, filter, messages]);
  const showGlobal = Boolean(globalChat) && filter !== 'private';
  const requests = useMemo(
    () => visible.filter((conversation) => (
      conversation.friend !== 'outgoing'
      && isIncomingRequest(conversation, messages, currentUser.id)
      && !deletedPrivatePeer(conversation, currentUser.id, users)
    )),
    [messages, currentUser.id, users, visible],
  );
  const waiting = useMemo(
    () => visible.filter((conversation) => (
      conversation.friend === 'outgoing'
      && !deletedPrivatePeer(conversation, currentUser.id, users)
    )),
    [currentUser.id, users, visible],
  );
  const listed = useMemo(
    () => visible.filter((conversation) => !requests.includes(conversation) && !waiting.includes(conversation)),
    [requests, visible, waiting],
  );
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
  const inboxBadge = formatInboxBadge(stressPack ? stressPack.inbox : inboxCount);
  const presence = getUserPresence(currentUser.id, users);

  const foldDetail = (count: number, two: 'home.requestsTwo' | 'home.waitingTwo', many: 'home.requestsMany' | 'home.waitingMany') => (
    count === 2 ? t(two) : t(many, { count })
  );
  const foldFaces = (list: Conversation[]) => {
    const people = [];
    for (const conversation of list) {
      const person = otherParticipant(conversation, currentUser.id, users);
      if (!person) continue;
      people.push(person);
      if (people.length === 3) break;
    }
    return people;
  };
  const renderRequest = (conversation: Conversation) => {
    const person = otherParticipant(conversation, currentUser.id, users);
    if (!person) return null;
    return (
      <article key={conversation.id} className="friend-request">
        <button type="button" className="friend-request-open" onClick={() => navigate(`/chat/${conversation.id}`)}>
          <Avatar name={person.displayName} color={person.color} size={48} src={person.avatarUrl} decoration={person.avatarDecoration} animate={false} />
          <span>
            <strong dir="auto">{person.displayName}</strong>
            <small>{t('home.wants')}</small>
          </span>
        </button>
        <div className="friend-actions">
          <button type="button" className="is-accept" onClick={() => void changeFriend(person.id, 'accept')}>{t('home.accept')}</button>
          <button type="button" onClick={() => void changeFriend(person.id, 'decline')}>{t('home.ignore')}</button>
        </div>
      </article>
    );
  };
  const renderWaiting = (conversation: Conversation) => {
    const person = otherParticipant(conversation, currentUser.id, users);
    if (!person) return null;
    return (
      <article key={conversation.id} className="friend-request">
        <button type="button" className="friend-request-open" onClick={() => navigate(`/chat/${conversation.id}`)}>
          <Avatar name={person.displayName} color={person.color} size={48} src={person.avatarUrl} decoration={person.avatarDecoration} animate={false} />
          <span>
            <strong dir="auto">{person.displayName}</strong>
            <small>{t('home.waiting')}</small>
          </span>
        </button>
        <div className="friend-actions">
          <button
            type="button"
            className="is-cancel"
            onClick={() => {
              void withdrawPrivate(conversation.id).then((ok) => {
                if (!ok) setNotice(t('home.cancelRequestFailed'));
              });
            }}
          >
            {t('home.cancelRequest')}
          </button>
        </div>
      </article>
    );
  };
  const renderFold = (kind: 'requests' | 'waiting', list: Conversation[], open: boolean, toggle: () => void) => (
    <button type="button" className={`request-fold${open ? ' is-open' : ''}`} aria-expanded={open} onClick={toggle}>
      <span className="request-fold-faces">
        {foldFaces(list).map((person) => (
          <Avatar key={person.id} name={person.displayName} color={person.color} size={36} src={person.avatarUrl} animate={false} />
        ))}
      </span>
      <span className="request-fold-copy">
        <strong>{t(kind === 'requests' ? 'home.requests' : 'home.waiting')}</strong>
        <small>{foldDetail(list.length, kind === 'requests' ? 'home.requestsTwo' : 'home.waitingTwo', kind === 'requests' ? 'home.requestsMany' : 'home.waitingMany')}</small>
      </span>
      <span className="request-fold-count">{list.length}</span>
      <IonIcon className="request-fold-chevron" icon={chevronDownOutline} aria-hidden="true" />
    </button>
  );

  const renderConversation = (conversation: Conversation) => {
    const last = lastMessageOf(conversation, messages);
    const self = isSelfChat(conversation);
    const other = conversation.type === 'private' ? (self ? currentUser : otherParticipant(conversation, currentUser.id, users)) : undefined;
    const gone = self ? false : deletedPrivatePeer(conversation, currentUser.id, users);
    const people = conversation.type === 'private' ? [] : membersOf(conversation, users);
    const online = people.filter((user) => user.status === 'online').length;
    return (
      <ConversationItem
        key={conversation.id}
        title={conversationTitle(conversation, currentUser.id, users)}
        color={other?.color ?? '#8ea099'}
        photo={conversation.type === 'private' ? other?.avatarUrl : conversation.avatarUrl}
        decoration={other?.avatarDecoration}
        preview={gone ? t('home.gone') : messagePreview(last, last?.senderId === currentUser.id)}
        deleted={Boolean(last?.deletedForEveryone)}
        time={last ? formatConversationTime(last.createdAt) : undefined}
        unread={gone ? 0 : conversation.unreadCount}
        type={conversation.type}
        detail={self ? t('home.self') : conversation.friend === 'outgoing' ? t('home.waiting') : people.length > 0 ? roomSummary(people.length, online) : undefined}
        muted={gone ? undefined : muteHint(conversation.id, mutes)}
        gone={gone}
        onRemove={gone ? () => setRemoveTarget(conversation) : undefined}
        onClick={() => navigate(`/chat/${conversation.id}`)}
        onHold={() => { if (!gone) setMuteTarget(conversation); }}
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
              <button type="button" className="home-nav-new" aria-label={t('home.newChat')} onClick={() => navigate('/new')}>
                <IonIcon icon={createOutline} />
              </button>
            </div>
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent className="home-scroll" scrollY={true}>
        {!ready ? (
          <PageSkeleton kind="home" />
        ) : (
          <>
          {notice ? <p className="form-error account-notice">{notice}</p> : null}
          <IonSegment className="home-filters" value={filter} onIonChange={(event) => setFilter((event.detail.value as Filter) || 'all')}>
            <IonSegmentButton value="all">
              <IonLabel>{t('home.all')}</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="private">
              <IonLabel>{t('home.private')}</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="group">
              <IonLabel>{t('home.groups')}</IonLabel>
            </IonSegmentButton>
          </IonSegment>
          {showGlobal && globalChat && (
            <section className="home-section">
              <h2>{t('home.mainGroup')}</h2>
              {renderConversation(globalChat)}
            </section>
          )}
          {requests.length === 1 && (
            <section className="home-section">
              <h2>{t('home.requests')} <span>1</span></h2>
              {renderRequest(requests[0])}
            </section>
          )}
          {requests.length > 1 && (
            <section className="home-section">
              {renderFold('requests', requests, requestsOpen, () => setRequestsOpen((open) => !open))}
              {requestsOpen ? requests.map((conversation) => renderRequest(conversation)) : null}
            </section>
          )}
          {waiting.length === 1 && (
            <section className="home-section">
              <h2>{t('home.waiting')} <span>1</span></h2>
              {renderWaiting(waiting[0])}
            </section>
          )}
          {waiting.length > 1 && (
            <section className="home-section">
              {renderFold('waiting', waiting, waitingOpen, () => setWaitingOpen((open) => !open))}
              {waitingOpen ? waiting.map((conversation) => renderWaiting(conversation)) : null}
            </section>
          )}
          {listed.length === 0 && requests.length === 0 && waiting.length === 0 && !showGlobal ? (
            <EmptyState title={t('home.empty')} />
          ) : listed.length > 0 ? (
            <section className="home-section">
              {(showGlobal || requests.length > 0 || waiting.length > 0) && <h2>{t('home.recent')}</h2>}
              <div className="home-list">
                {listed.map((conversation) => renderConversation(conversation))}
              </div>
            </section>
          ) : null}
          </>
        )}
      </IonContent>
      <div className="user-dock">
        <button type="button" className="user-dock-main" onClick={() => navigate('/account')}>
          <span className="user-dock-avatar">
            <Avatar name={stressPack?.dockName ?? currentUser.displayName} color={currentUser.color} size={46} src={stressPack ? stressPack.dockPhoto || undefined : currentUser.avatarUrl} decoration={stressPack ? undefined : currentUser.avatarDecoration} />
            <i className={presence === 'online' ? 'on' : ''} />
          </span>
          <span className="user-dock-copy">
            <strong>
              <span>{stressPack?.dockName ?? currentUser.displayName}</span>
              <IonIcon icon={chevronDownOutline} />
            </strong>
            <em>{connectionLabel(currentUser, { self: true })}</em>
          </span>
        </button>
        <button type="button" className="user-dock-bell" aria-label={inboxBadge ? t('home.notificationsUnread', { count: inboxBadge }) : t('home.notifications')} onClick={() => navigate('/notifications')}>
          <IonIcon icon={notificationsOutline} />
          {inboxBadge && <span className="dock-badge">{inboxBadge}</span>}
        </button>
      </div>
      {removeTarget && (
        <PermissionDialog
          title={t('home.removeTitle')}
          body={t('home.removeBody')}
          allowLabel={t('home.remove')}
          laterLabel={t('chat.cancel')}
          onAllow={() => {
            const id = removeTarget.id;
            setRemoveTarget(undefined);
            void dismissDeletedChat(id).then((ok) => {
              if (!ok) setNotice(t('home.removeFailed'));
            });
          }}
          onLater={() => setRemoveTarget(undefined)}
        />
      )}
      {import.meta.env.DEV ? <HomeStressBar mode={stress.mode} onChoose={stress.choose} /> : null}
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
  if (level === 'none') return t('home.noNotify');
  if (level === 'mentions') return t('home.mentionsOnly');
  if (level === 'everyone') return '@everyone';
  if (level === 'custom') return t('home.custom');
  return undefined;
}
