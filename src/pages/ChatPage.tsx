import { useEffect, useMemo, useRef, useState } from 'react';
import { IonContent, IonFooter, IonHeader, IonIcon, IonPage } from '@ionic/react';
import { arrowDown, bookmarkOutline, peopleOutline, searchOutline } from 'ionicons/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Avatar from '../components/common/Avatar';
import EmptyState from '../components/common/EmptyState';
import PageSkeleton from '../components/common/PageSkeleton';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import MessageList from '../components/chat/MessageList';
import MessageSearch from '../components/chat/MessageSearch';
import MessageComposer from '../components/chat/MessageComposer';
import TypingIndicator from '../components/chat/TypingIndicator';
import PageNav from '../components/common/PageNav';
import GroupHeader from '../components/groups/GroupHeader';
import UserProfileModal from '../components/users/UserProfileModal';
import type { User } from '../types/user';
import { MESSAGE_HIGHLIGHT_DURATION, MESSAGE_PAGE_SIZE } from '../constants/chat';
import { startPolling } from '../lib/poll';
import { GLOBAL_CHAT_ID } from '../data/conversations';
import { isServerId, SERVER_GLOBAL_ROOM_ID } from '../lib/home';
import { catchUpLabel, membersOf, otherParticipant, unreadAbove } from '../lib/conversation';
import { resolveMessageFocus } from '../lib/inbox';
import { matchingMessages } from '../lib/messageSearch';
import { connectionLabel, getUserPresence } from '../lib/presence';
import { recalledScroll, rememberScroll } from '../lib/scrollMemory';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useSavedStore } from '../stores/savedStore';
import { useUserStore } from '../stores/userStore';

const NO_TYPING: string[] = [];

export default function ChatPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const focusId = params.get('at') ?? '';
  const focusMissing = params.get('missing') === '1';
  const [spotlight, setSpotlight] = useState('');
  const [focusMiss, setFocusMiss] = useState(false);
  const navigate = useNavigate();
  const endRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLIonContentElement>(null);
  const stickRef = useRef(true);
  const lengthRef = useRef(0);
  const currentUser = useAuthStore((state) => state.currentUser);
  const users = useUserStore((state) => state.users);
  const conversations = useChatStore((state) => state.conversations);
  const allMessages = useChatStore((state) => state.messages);
  const typingMap = useChatStore((state) => state.typingByConversation);
  const loadOlder = useChatStore((state) => state.loadOlder);
  const revealMessage = useChatStore((state) => state.revealMessage);
  const historyLimit = useChatStore((state) => state.historyLimit);
  const hasMore = useChatStore((state) => state.roomHasMore[id] ?? false);
  const markRead = useChatStore((state) => state.markRead);
  const setTyping = useChatStore((state) => state.setTyping);
  const cancelEdit = useChatStore((state) => state.cancelEdit);
  const openPrivate = useChatStore((state) => state.openPrivate);
  const [profile, setProfile] = useState<User>();
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [arrivalUnread, setArrivalUnread] = useState(0);
  const [fresh, setFresh] = useState(0);
  const [away, setAway] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const profileRef = useRef<HTMLButtonElement>(null);
  const membersRef = useRef<HTMLButtonElement>(null);
  const directRef = useRef<HTMLButtonElement>(null);
  const savedRef = useRef<HTMLButtonElement>(null);
  const savedHere = useSavedStore((state) => state.entries.filter((entry) => entry.userId === currentUser.id && entry.conversationId === id).length);
  const conversation = conversations.find((item) => item.id === id);
  const roomId = conversation && conversation.type !== 'private' ? conversation.id : '';
  const privateId = conversation?.type === 'private' ? conversation.id : '';
  const messages = useMemo(
    () =>
      allMessages
        .filter((message) => message.conversationId === id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [allMessages, id],
  );
  const typingIds = typingMap[id] ?? NO_TYPING;
  const searching = searchOpen && searchQuery.trim().length > 0;
  const thread = useMemo(
    () => (searching ? matchingMessages(messages, searchQuery) : messages),
    [messages, searchQuery, searching],
  );

  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, [id]);

  useEffect(() => {
    if (!searching) return;
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [searching, searchQuery, thread.length]);

  useEffect(() => {
    setReady(useChatStore.getState().fullRooms.includes(id));
    setNotice('');
    let alive = true;
    const wait = new Promise((resolve) => window.setTimeout(resolve, 220));
    const load = (async () => {
      const me = useAuthStore.getState().currentUser.id;
      if (isServerId(me) && id === GLOBAL_CHAT_ID) {
        navigate(`/chat/${SERVER_GLOBAL_ROOM_ID}`, { replace: true });
        return true;
      }
      if (!isServerId(id)) return true;
      if (isServerId(me)) await useChatStore.getState().loadHome();
      return useChatStore.getState().loadRoom(id, focusId && isServerId(focusId) ? { aroundId: focusId } : undefined);
    })();
    void Promise.all([wait, load]).then(([, loaded]) => {
      if (!alive) return;
      setNotice(loaded ? '' : 'تعذر تحميل الرسائل.');
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [id, navigate, focusId]);

  useEffect(() => {
    if (!isServerId(id)) return;
    return startPolling(() => useChatStore.getState().loadRoom(id, focusId && isServerId(focusId) ? { aroundId: focusId } : undefined), {
      immediate: false,
      active: () => window.location.pathname === `/chat/${id}` && (Boolean(focusId) || (useChatStore.getState().historyLimit[id] ?? MESSAGE_PAGE_SIZE) <= MESSAGE_PAGE_SIZE),
    });
  }, [id, focusId]);

  useEffect(() => {
    cancelEdit();
  }, [id, cancelEdit]);

  useEffect(() => {
    const count = useChatStore.getState().conversations.find((item) => item.id === id)?.unreadCount ?? 0;
    setArrivalUnread(count);
    setFresh(0);
    setAway(false);
    lengthRef.current = 0;
    stickRef.current = count === 0 && recalledScroll(id) === undefined;
  }, [id]);

  useEffect(() => {
    if (!id || typingIds.length === 0) return;
    const timer = window.setTimeout(() => setTyping(id, []), 6000);
    return () => window.clearTimeout(timer);
  }, [id, setTyping, typingIds.length]);

  useEffect(() => {
    if (!focusId) {
      setSpotlight('');
      return;
    }
    setSpotlight(focusId);
    const timer = window.setTimeout(() => setSpotlight(''), MESSAGE_HIGHLIGHT_DURATION);
    return () => window.clearTimeout(timer);
  }, [focusId]);

  useEffect(() => {
    if (!id || (!focusId && !focusMissing)) return;
    if (!ready && isServerId(id)) return;
    const target = focusId ? resolveMessageFocus(allMessages, id, focusId, historyLimit[id] ?? MESSAGE_PAGE_SIZE) : 'missing';
    if (focusMissing || target === 'missing') {
      setFocusMiss(true);
      const timer = window.setTimeout(() => setFocusMiss(false), 2400);
      return () => window.clearTimeout(timer);
    }
    if (target === 'older') revealMessage(id, focusId);
  }, [allMessages, focusId, focusMissing, historyLimit, id, ready, revealMessage]);

  useEffect(() => {
    if (!ready || !focusId) return;
    const node = document.getElementById(`msg-${focusId}`);
    if (!node) return;
    stickRef.current = false;
    let alive = true;
    const timer = window.setTimeout(() => {
      if (!alive) return;
      void contentRef.current?.getScrollElement().then((scroller) => {
        const nodeRect = node.getBoundingClientRect();
        const scrollRect = scroller.getBoundingClientRect();
        const top = scroller.scrollTop + nodeRect.top - scrollRect.top - (scroller.clientHeight - nodeRect.height) / 2;
        void contentRef.current?.scrollToPoint(0, Math.max(0, top), 280);
      });
    }, 40);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [focusId, historyLimit, id, messages.length, ready]);

  useEffect(() => {
    if (!id || focusId || focusMissing || arrivalUnread <= 0) return;
    if (isServerId(id)) return;
    const shown = Math.min(messages.length, historyLimit[id] ?? MESSAGE_PAGE_SIZE);
    if (unreadAbove(arrivalUnread, messages.length, shown) > 0) return;
    markRead(id);
  }, [arrivalUnread, focusId, focusMissing, historyLimit, id, markRead, messages.length]);

  useEffect(() => {
    if (!ready || !isServerId(id)) return;
    let timer: number | undefined;
    let reading = false;
    const check = async () => {
      if (reading || document.visibilityState === 'hidden' || window.location.pathname !== `/chat/${id}`) return;
      const scroller = await contentRef.current?.getScrollElement();
      if (!scroller) return;
      const bounds = scroller.getBoundingClientRect();
      const visible = messages.filter((message) => {
        if (message.status !== 'sent') return false;
        const node = document.getElementById(`msg-${message.id}`);
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        const overlap = Math.max(0, Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top));
        return rect.height > 0 && overlap >= Math.min(rect.height, bounds.height) * 0.6;
      });
      const target = visible.at(-1);
      if (!target) return;
      reading = true;
      try { await markRead(id, target.id); } finally { reading = false; }
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void check(), 900);
    };
    let stopped = false;
    let scroller: HTMLElement | undefined;
    void contentRef.current?.getScrollElement().then((element) => {
      if (stopped) return;
      scroller = element;
      scroller.addEventListener('scroll', schedule, { passive: true });
      schedule();
    });
    document.addEventListener('visibilitychange', schedule);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      scroller?.removeEventListener('scroll', schedule);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [id, ready, messages, markRead, historyLimit]);

  useEffect(() => {
    if (!ready) return;
    const previous = lengthRef.current;
    lengthRef.current = messages.length;
    if (previous === 0) {
      if (focusId) {
        stickRef.current = false;
        return;
      }
      const saved = recalledScroll(id);
      const shown = Math.min(messages.length, historyLimit[id] ?? MESSAGE_PAGE_SIZE);
      if (arrivalUnread > 0 && unreadAbove(arrivalUnread, messages.length, shown) === 0) {
        document.getElementById('unread-anchor')?.scrollIntoView({ block: 'center' });
        stickRef.current = false;
        return;
      }
      if (typeof saved === 'number') {
        void contentRef.current?.scrollToPoint(0, saved, 0);
        stickRef.current = false;
        return;
      }
      endRef.current?.scrollIntoView({ block: 'end' });
      stickRef.current = true;
      return;
    }
    if (messages.length > previous && stickRef.current) {
      endRef.current?.scrollIntoView({ block: 'end' });
      return;
    }
    if (messages.length > previous) setFresh((count) => count + (messages.length - previous));
  }, [arrivalUnread, focusId, historyLimit, id, messages.length, ready]);

  useEffect(() => {
    if (stickRef.current) endRef.current?.scrollIntoView({ block: 'end' });
  }, [typingIds.length]);

  useEffect(() => () => {
    void contentRef.current?.getScrollElement().then((element) => rememberScroll(id, element.scrollTop));
  }, [id]);

  useEffect(() => {
    if (!privateId) return;
    const openDirect = (event: Event) => {
      const path = event.composedPath();
      if (directRef.current && path.includes(directRef.current)) navigate(`/chat/${privateId}/media`);
    };
    window.addEventListener('click', openDirect, true);
    return () => window.removeEventListener('click', openDirect, true);
  }, [navigate, privateId]);

  useEffect(() => {
    const openSaved = (event: Event) => {
      if (savedRef.current && event.composedPath().includes(savedRef.current)) navigate(`/saved?room=${id}`);
    };
    window.addEventListener('click', openSaved, true);
    return () => window.removeEventListener('click', openSaved, true);
  }, [id, navigate]);

  useEffect(() => {
    if (!roomId) return;
    const openProfile = (event: Event) => {
      const path = event.composedPath();
      const title = profileRef.current;
      const members = membersRef.current;
      if ((title && path.includes(title)) || (members && path.includes(members))) {
        navigate(`/group/${roomId}`);
      }
    };
    window.addEventListener('click', openProfile, true);
    return () => window.removeEventListener('click', openProfile, true);
  }, [roomId, navigate]);

  const leavingDemo = isServerId(currentUser.id) && id === GLOBAL_CHAT_ID;
  if (!conversation || leavingDemo) {
    const waiting = leavingDemo || (!ready && isServerId(id));
    return (
      <IonPage>
        <IonHeader>
          <NetworkStatusBanner />
          <PageNav title="المحادثة" fallback="/home" />
        </IonHeader>
        <IonContent>
          {waiting ? <PageSkeleton kind="chat" /> : <EmptyState title="المحادثة غير موجودة" />}
        </IonContent>
      </IonPage>
    );
  }

  const other = conversation.type === 'private' ? otherParticipant(conversation, currentUser.id, users) : undefined;
  const members = membersOf(conversation, users);
  const onlineCount = members.filter((user) => getUserPresence(user.id, users) === 'online').length;
  const typingNames = typingIds
    .filter((userId) => userId !== currentUser.id)
    .map((userId) => users.find((user) => user.id === userId)?.displayName)
    .filter((name): name is string => Boolean(name));
  const pendingUnread = unreadAbove(arrivalUnread, messages.length, Math.min(messages.length, historyLimit[id] ?? MESSAGE_PAGE_SIZE));

  return (
    <IonPage>
      <IonHeader>
        <NetworkStatusBanner />
        <PageNav
          quiet
          fallback="/home"
          title={
            conversation.type !== 'private' ? (
              <button ref={profileRef} type="button" className="chat-nav-main" aria-label="ملف المجموعة">
                <Avatar name={conversation.name ?? 'مجموعة'} color="#3d9b84" size={32} src={conversation.avatarUrl} />
                <GroupHeader
                  title={conversation.name ?? 'مجموعة'}
                  subtitle={
                    currentUser.status === 'online'
                      ? onlineCount === 0
                        ? 'لا أحد متصل'
                        : `${onlineCount} متصل`
                      : `${onlineCount === 0 ? 'لا أحد متصل' : `${onlineCount} متصل`} · ${connectionLabel(currentUser)}`
                  }
                  online={onlineCount > 0}
                />
              </button>
            ) : (
              <div className="chat-nav-main">
                {other && (
                  <button type="button" className="chat-avatar" aria-label={other.displayName} onClick={() => setProfile(other)}>
                    <Avatar name={other.displayName} color={other.color} size={32} src={other.avatarUrl} />
                    {getUserPresence(other.id, users) === 'online' && <span className="presence" />}
                  </button>
                )}
                {other && (
                  <button ref={directRef} type="button" className="chat-nav-name" aria-label="وسائط المحادثة">
                    <GroupHeader title={other.displayName} subtitle={connectionLabel(other)} online={getUserPresence(other.id, users) === 'online'} />
                  </button>
                )}
              </div>
            )
          }
          action={
            <div className="home-nav-actions">
              <button
                type="button"
                className={searchOpen ? 'home-nav-menu is-on' : 'home-nav-menu'}
                aria-label="بحث"
                aria-expanded={searchOpen}
                onClick={() => {
                  setSearchQuery('');
                  setSearchOpen((open) => !open);
                }}
              >
                <IonIcon icon={searchOutline} />
              </button>
              <button ref={savedRef} type="button" className="home-nav-menu saved-nav" aria-label="المحفوظات">
                <IonIcon icon={bookmarkOutline} />
                {savedHere > 0 && <span className="nav-count">{savedHere > 9 ? '9+' : savedHere}</span>}
              </button>
              {conversation.type !== 'private' && (
                <button ref={membersRef} type="button" className="home-nav-menu" aria-label="الأعضاء">
                  <IonIcon icon={peopleOutline} />
                </button>
              )}
            </div>
          }
        />
        {searchOpen && <MessageSearch value={searchQuery} onChange={setSearchQuery} />}
      </IonHeader>
      <IonContent
        ref={contentRef}
        scrollEvents
        onIonScroll={(event) => {
          rememberScroll(id, event.detail.scrollTop);
          void contentRef.current?.getScrollElement().then((element) => {
            const gap = element.scrollHeight - element.scrollTop - element.clientHeight;
            const atEnd = gap < 96;
            stickRef.current = atEnd;
            setAway(!atEnd);
            if (atEnd) setFresh(0);
          });
        }}
      >
        {notice ? <p className="focus-miss" role="status">{notice}</p> : null}
        {focusMiss && <p className="focus-miss" role="status">تعذر العثور على الرسالة</p>}
        <div className="chat-thread">
          {!ready ? (
            <PageSkeleton kind="chat" />
          ) : thread.length === 0 ? (
            <EmptyState title={searching ? 'لا توجد رسائل' : 'لا توجد رسائل بعد'} />
          ) : (
            <MessageList
              messages={thread}
              limit={searching ? thread.length : (historyLimit[id] ?? 30)}
              filtered={searching}
              hasMore={hasMore}
              showAuthor={conversation.type !== 'private'}
              group={conversation.type !== 'private'}
              direct={conversation.type === 'private'}
              conversationId={conversation.id}
              memberIds={conversation.participantIds}
              users={users}
              currentUserId={currentUser.id}
              unreadCount={arrivalUnread}
              spotlightId={spotlight}
              onOpenProfile={setProfile}
              onLoadOlder={() => loadOlder(id)}
            />
          )}
          <TypingIndicator names={typingNames} />
          <div ref={endRef} />
        </div>
      </IonContent>
      {!searching && pendingUnread > 0 && (
        <button
          type="button"
          className="unread-catch"
          onClick={() => {
            void loadOlder(id).then(() => document.getElementById('unread-anchor')?.scrollIntoView({ block: 'start' }));
          }}
        >
          {catchUpLabel(pendingUnread)}
        </button>
      )}
      {(away || (historyLimit[id] ?? 30) > 120) && (
        <button type="button" className="jump-latest" onClick={() => {
          stickRef.current = true;
          setAway(false);
          setFresh(0);
          useChatStore.setState((state) => ({ historyLimit: { ...state.historyLimit, [id]: 30 } }));
          if (focusId) setParams({}, { replace: true });
          void useChatStore.getState().loadRoom(id);
          endRef.current?.scrollIntoView({ block: 'end' });
        }}>
          <IonIcon icon={arrowDown} />
          {fresh > 0 ? <span>{fresh}</span> : null}
        </button>
      )}
      <IonFooter className="chat-footer">
        <MessageComposer conversationId={conversation.id} />
      </IonFooter>
      <UserProfileModal
        user={profile}
        isSelf={profile?.id === currentUser.id}
        onClose={() => setProfile(undefined)}
        onMessage={(userId) => {
          setProfile(undefined);
          void openPrivate(userId).then((conversationId) => {
            if (conversationId) navigate(`/chat/${conversationId}`);
          });
        }}
      />
    </IonPage>
  );
}
