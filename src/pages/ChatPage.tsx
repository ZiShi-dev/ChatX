import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { typingLabel } from '../lib/typing';
import UserProfileModal from '../components/users/UserProfileModal';
import type { Message } from '../types/message';
import type { User } from '../types/user';
import { CHAT_VISIBLE_WINDOW, MESSAGE_HIGHLIGHT_DURATION, MESSAGE_PAGE_SIZE, SKELETON_DELAY_MS } from '../constants/chat';
import { GLOBAL_CHAT_ID } from '../data/conversations';
import { isServerId, SERVER_GLOBAL_ROOM_ID } from '../lib/home';
import { catchUpLabel, deletedPrivatePeer, historyLimitForUnread, membersOf, openUnreadCount, otherParticipant, unreadAbove, unreadScrollTop } from '../lib/conversation';
import { resolveMessageFocus } from '../lib/inbox';
import { observeComposerViewport } from '../lib/composerViewport';
import { dismissOverlayHistory, registerOverlayClose, useOverlayHistory } from '../lib/overlayBack';
import '../components/chat/ComposerLayout.css';
import { matchingMessages } from '../lib/messageSearch';
import { connectionLabel, getUserPresence } from '../lib/presence';
import { useAuthStore } from '../stores/authStore';
import { useNetworkStore } from '../stores/networkStore';
import { useChatStore } from '../stores/chatStore';
import { useSavedStore } from '../stores/savedStore';
import { useUserStore } from '../stores/userStore';

const NO_TYPING: string[] = [];

function pinBottom(scroller: HTMLElement) {
  scroller.scrollTop = scroller.scrollHeight;
}

let glideToken = 0;
let glideUntil = 0;
let glideTop = -1;
let followSendUntil = 0;

function stillMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function bottomTop(scroller: HTMLElement) {
  return Math.max(0, scroller.scrollHeight - scroller.clientHeight);
}

function glideBottom(scroller: HTMLElement, ms = 260) {
  const token = ++glideToken;
  const targetNow = bottomTop(scroller);
  if (stillMotion() || ms <= 0 || Math.abs(targetNow - scroller.scrollTop) < 2) {
    scroller.scrollTop = targetNow;
    glideTop = targetNow;
    glideUntil = 0;
    return;
  }
  const startTop = scroller.scrollTop;
  const start = performance.now();
  glideUntil = start + ms;
  const step = (now: number) => {
    if (token !== glideToken) return;
    const t = Math.min(1, (now - start) / ms);
    const ease = 1 - (1 - t) ** 3;
    const target = bottomTop(scroller);
    const next = startTop + (target - startTop) * ease;
    glideTop = next;
    scroller.scrollTop = next;
    if (t < 1) window.requestAnimationFrame(step);
    else {
      const end = bottomTop(scroller);
      glideTop = end;
      scroller.scrollTop = end;
      if (token === glideToken) glideUntil = 0;
    }
  };
  window.requestAnimationFrame(step);
}

function beginSendGlide(scroller: HTMLElement, followMs = 700) {
  followSendUntil = performance.now() + followMs;
  glideBottom(scroller, 280);
}

function sendFollow(scroller: HTMLElement) {
  if (performance.now() >= followSendUntil) return false;
  if (glideUntil <= performance.now()) glideBottom(scroller, 180);
  return true;
}

function stickThread(scroller: HTMLElement, following: { current: boolean }) {
  if (sendFollow(scroller)) return;
  if (following.current || performance.now() < followSendUntil) pinBottom(scroller);
}

function noteSendScroll(scrollTop: number) {
  if (glideUntil <= performance.now() || glideTop < 0) return false;
  if (scrollTop >= glideTop - 24) return false;
  glideToken += 1;
  glideUntil = 0;
  glideTop = -1;
  followSendUntil = 0;
  return true;
}

function pinToUnread(scroller: HTMLElement) {
  const anchor = document.getElementById('unread-anchor');
  if (!anchor) return false;
  const top = scroller.scrollTop + anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  scroller.scrollTop = unreadScrollTop(top, scroller.scrollHeight, scroller.clientHeight);
  return true;
}

function roomUnreadCount(roomId: string, userId: string, list: Message[]) {
  const state = useChatStore.getState();
  const server = state.conversations.find((item) => item.id === roomId)?.unreadCount ?? 0;
  const inbox = state.serverInbox.filter((item) => item.conversationId === roomId && item.unread && item.kind !== 'reaction').length;
  return openUnreadCount(server, inbox, list, userId);
}

function settleBottom(scroller: HTMLElement, onDone: () => void) {
  let tries = 0;
  const step = () => {
    pinBottom(scroller);
    tries += 1;
    const gap = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    const overflow = scroller.scrollHeight > scroller.clientHeight + 8;
    if (tries < 16 && (!overflow || gap > 4)) window.requestAnimationFrame(step);
    else onDone();
  };
  step();
}

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
  const placedRef = useRef(false);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const lengthRef = useRef(0);
  const seenIds = useRef(new Set<string>());
  const openedUnread = useRef(0);
  const markedFocus = useRef('');
  const pinnedFocus = useRef('');
  const currentUser = useAuthStore((state) => state.currentUser);
  const users = useUserStore((state) => state.users);
  const conversations = useChatStore((state) => state.conversations);
  const allMessages = useChatStore((state) => state.messages);
  const serverInbox = useChatStore((state) => state.serverInbox);
  const typingMap = useChatStore((state) => state.typingByConversation);
  const loadOlder = useChatStore((state) => state.loadOlder);
  const seekMessage = useChatStore((state) => state.seekMessage);
  const historyLimit = useChatStore((state) => state.historyLimit);
  const roomHistoryLimit = historyLimit[id] ?? MESSAGE_PAGE_SIZE;
  const hasMore = useChatStore((state) => state.roomHasMore[id] ?? false);
  const markRead = useChatStore((state) => state.markRead);
  const setTyping = useChatStore((state) => state.setTyping);
  const cancelEdit = useChatStore((state) => state.cancelEdit);
  const openPrivate = useChatStore((state) => state.openPrivate);
  const [profile, setProfile] = useState<User>();
  const [ready, setReady] = useState(false);
  const [skeleton, setSkeleton] = useState(false);
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
  const savedHere = useSavedStore((state) => {
    let count = 0;
    for (const entry of state.entries) {
      if (entry.userId === currentUser.id && entry.conversationId === id) count += 1;
    }
    return count;
  });
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
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const resumeBack = useMemo(() => {
    if (arrivalUnread <= 0) return 0;
    const need = Math.min(messages.length, arrivalUnread + 14);
    return need > CHAT_VISIBLE_WINDOW ? need - CHAT_VISIBLE_WINDOW : 0;
  }, [arrivalUnread, messages.length]);

  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, [id]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  useOverlayHistory(searchOpen, closeSearch);

  useEffect(() => {
    if (!searchOpen) return;
    return registerOverlayClose(closeSearch);
  }, [closeSearch, searchOpen]);

  useEffect(() => {
    if (!searching) return;
    void contentRef.current?.getScrollElement().then((scroller) => {
      if (scroller) pinBottom(scroller);
    });
  }, [searching, searchQuery, thread.length]);

  useEffect(() => {
    const cached = useChatStore.getState().fullRooms.includes(id);
    setReady(cached);
    setSkeleton(false);
    setNotice('');
    let alive = true;
    const skeletonTimer = window.setTimeout(() => {
      if (alive) setSkeleton(true);
    }, SKELETON_DELAY_MS);
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
    void load.then((loaded) => {
      if (!alive) return;
      window.clearTimeout(skeletonTimer);
      const hasMessages = useChatStore.getState().messages.some((message) => message.conversationId === id);
      setNotice(loaded || hasMessages ? '' : 'تعذر تحميل الرسائل.');
      setReady(true);
    });
    return () => {
      alive = false;
      window.clearTimeout(skeletonTimer);
    };
  }, [id, navigate, focusId]);

  useEffect(() => {
    if (!isServerId(id)) return;
    const control = new AbortController();
    let stopped = false;
    let failures = 0;
    const wait = (ms: number) => new Promise((resolve) => { window.setTimeout(resolve, ms); });
    const run = async () => {
      while (!stopped) {
        const quiet = document.visibilityState === 'hidden' || window.location.pathname !== `/chat/${id}` || useNetworkStore.getState().network === 'offline';
        if (quiet) {
          await wait(1_000);
          continue;
        }
        const loaded = await useChatStore.getState().loadRoom(id, { wait: true, signal: control.signal });
        if (stopped) return;
        if (loaded || useChatStore.getState().messages.some((message) => message.conversationId === id)) setNotice('');
        failures = loaded ? 0 : failures + 1;
        if (failures) await wait(Math.min(8_000, 400 * 2 ** Math.min(failures, 4)));
      }
    };
    void run();
    return () => {
      stopped = true;
      control.abort();
    };
  }, [id]);

  useEffect(() => {
    cancelEdit();
  }, [id, cancelEdit]);

  useEffect(() => {
    if (!ready || !isServerId(id) || !isServerId(focusId) || markedFocus.current === `${id}:${focusId}`) return;
    const target = allMessages.find((message) => message.id === focusId && message.conversationId === id && message.status === 'sent');
    if (!target) return;
    markedFocus.current = `${id}:${focusId}`;
    void markRead(id, focusId);
  }, [allMessages, focusId, id, markRead, ready]);

  useEffect(() => {
    const list = useChatStore.getState().messages.filter((message) => message.conversationId === id);
    const count = roomUnreadCount(id, useAuthStore.getState().currentUser.id, list);
    openedUnread.current = count;
    seenIds.current = new Set();
    setArrivalUnread(count);
    setFresh(0);
    setAway(false);
    lengthRef.current = 0;
    placedRef.current = false;
    stickRef.current = count <= 0;
    if (count <= 0) {
      const limit = useChatStore.getState().historyLimit[id] ?? MESSAGE_PAGE_SIZE;
      if (limit > MESSAGE_PAGE_SIZE) {
        useChatStore.setState((state) => ({ historyLimit: { ...state.historyLimit, [id]: MESSAGE_PAGE_SIZE } }));
      }
    }
  }, [id]);

  useEffect(() => {
    if (!ready || focusId) return;
    const count = roomUnreadCount(id, currentUser.id, messages);
    if (count === openedUnread.current && (placedRef.current || count > 0)) return;
    openedUnread.current = count;
    setArrivalUnread(count);
    stickRef.current = count <= 0;
    if (count > 0) {
      if (!placedRef.current) return;
      return;
    }
    void contentRef.current?.getScrollElement().then((scroller) => {
      if (!scroller) return;
      stickRef.current = true;
      settleBottom(scroller, () => {
        placedRef.current = true;
      });
    });
  }, [conversation?.unreadCount, currentUser.id, focusId, id, messages, ready, serverInbox]);

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
    if (!focusId) {
      if (focusMissing) {
        setFocusMiss(true);
        const timer = window.setTimeout(() => setFocusMiss(false), 2400);
        return () => window.clearTimeout(timer);
      }
      return;
    }
    let cancelled = false;
    void seekMessage(id, focusId).then((found) => {
      if (cancelled || found) return;
      const limit = useChatStore.getState().historyLimit[id] ?? MESSAGE_PAGE_SIZE;
      if (resolveMessageFocus(useChatStore.getState().messages, id, focusId, limit) !== 'missing') return;
      setFocusMiss(true);
      window.setTimeout(() => setFocusMiss(false), 2400);
    });
    return () => {
      cancelled = true;
    };
  }, [allMessages.length, focusId, focusMissing, historyLimit[id], id, ready, seekMessage]);

  useEffect(() => {
    pinnedFocus.current = '';
  }, [focusId, id]);

  useEffect(() => {
    if (!ready || !focusId) return;
    const token = `${id}:${focusId}`;
    if (pinnedFocus.current === token) return;
    const node = document.getElementById(`msg-${focusId}`);
    if (!node) return;
    pinnedFocus.current = token;
    stickRef.current = false;
    window.setTimeout(() => {
      if (pinnedFocus.current !== token) return;
      const current = document.getElementById(`msg-${focusId}`);
      if (!current) return;
      void contentRef.current?.getScrollElement().then((scroller) => {
        const nodeRect = current.getBoundingClientRect();
        const scrollRect = scroller.getBoundingClientRect();
        const top = scroller.scrollTop + nodeRect.top - scrollRect.top - (scroller.clientHeight - nodeRect.height) / 2;
        void contentRef.current?.scrollToPoint(0, Math.max(0, top), 280);
      });
    }, 40);
  }, [focusId, historyLimit, id, messages.length, ready]);

  useEffect(() => {
    if (!id || focusId || focusMissing || arrivalUnread <= 0) return;
    if (isServerId(id)) return;
    const shown = Math.min(messages.length, historyLimit[id] ?? MESSAGE_PAGE_SIZE);
    if (unreadAbove(arrivalUnread, messages.length, shown) > 0) return;
    void markRead(id).then((saved) => {
      if (saved) setArrivalUnread(0);
    });
  }, [arrivalUnread, focusId, focusMissing, historyLimit, id, markRead, messages.length]);

  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    let scroller: HTMLElement | undefined;
    let readTimer: number | undefined;
    let reading = false;
    let keepBottom = false;
    let keepTimer = 0;
    let scrollerHeight = 0;
    const syncStick = () => {
      if (!scroller) return;
      const gap = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      const atEnd = gap < 96;
      stickRef.current = atEnd;
      setAway((current) => (current === !atEnd ? current : !atEnd));
      if (atEnd) setFresh((count) => (count === 0 ? count : 0));
    };
    const markVisible = async (leaving = false) => {
      if ((!leaving && !placedRef.current) || !isServerId(id) || reading || !scroller) return;
      if (!leaving && (document.visibilityState === 'hidden' || window.location.pathname !== `/chat/${id}`)) return;
      const list = messagesRef.current;
      const gap = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      let targetId = '';
      if (gap < 96) {
        for (let index = list.length - 1; index >= 0; index -= 1) {
          if (list[index].status === 'sent') {
            targetId = list[index].id;
            break;
          }
        }
      } else {
        const bounds = scroller.getBoundingClientRect();
        const nodes = scroller.querySelectorAll<HTMLElement>('[id^="msg-"]');
        for (let index = nodes.length - 1; index >= 0; index -= 1) {
          const rect = nodes[index].getBoundingClientRect();
          const overlap = Math.max(0, Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top));
          if (rect.height > 0 && overlap >= 12) {
            targetId = nodes[index].id.slice(4);
            break;
          }
        }
      }
      const target = list.find((message) => message.id === targetId && message.status === 'sent');
      if (!target) return;
      reading = true;
      try {
        const saved = await markRead(id, target.id);
        if (!saved) return;
        const index = list.findIndex((message) => message.id === target.id);
        if (index < 0) return;
        const remaining = list.slice(index + 1).filter((message) => message.status === 'sent' && message.senderId !== currentUser.id).length;
        setArrivalUnread((current) => (current > remaining ? remaining : current));
      } finally { reading = false; }
    };
    const onScroll = () => {
      if (!placedRef.current) return;
      if (scroller && noteSendScroll(scroller.scrollTop)) {
        stickRef.current = false;
        keepBottom = false;
        setAway(true);
        return;
      }
      if (keepBottom) {
        stickRef.current = true;
        return;
      }
      syncStick();
      window.clearTimeout(readTimer);
      readTimer = window.setTimeout(() => void markVisible(), 900);
    };
    const pinIfStuck = () => {
      const element = scrollerRef.current;
      if (!element || (!stickRef.current && !keepBottom)) return;
      pinBottom(element);
    };
    const holdBottom = () => {
      if (!stickRef.current && !keepBottom) return;
      keepBottom = true;
      stickRef.current = true;
      window.clearTimeout(keepTimer);
      pinIfStuck();
      window.requestAnimationFrame(pinIfStuck);
      keepTimer = window.setTimeout(() => {
        pinIfStuck();
        keepBottom = false;
      }, 400);
    };
    const thread = endRef.current?.parentElement;
    const mutations = new MutationObserver(() => {
      window.clearTimeout(readTimer);
      readTimer = window.setTimeout(() => void markVisible(), 900);
    });
    if (thread) mutations.observe(thread, { childList: true, subtree: true });
    const observer = new ResizeObserver(() => {
      const element = scrollerRef.current;
      if (!element) return;
      const next = element.clientHeight;
      const frameChanged = scrollerHeight > 0 && Math.abs(next - scrollerHeight) > 1;
      scrollerHeight = next;
      if (frameChanged) return;
      stickThread(element, stickRef);
      // Incoming messages can be visible without causing a scroll event.
      window.clearTimeout(readTimer);
      readTimer = window.setTimeout(() => void markVisible(), 900);
    });
    if (thread) observer.observe(thread);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', holdBottom);
    const onFocus = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.composer, .chat-footer')) holdBottom();
    };
    document.addEventListener('focusin', onFocus);
    void contentRef.current?.getScrollElement().then((element) => {
      if (stopped) return;
      scroller = element;
      scrollerRef.current = element;
      scrollerHeight = element.clientHeight;
      observer.observe(element);
      scroller.addEventListener('scroll', onScroll, { passive: true });
      readTimer = window.setTimeout(() => void markVisible(), 900);
    });
    const onVisible = () => {
      if (document.visibilityState === 'hidden') {
        void markVisible(true);
        return;
      }
      window.clearTimeout(readTimer);
      readTimer = window.setTimeout(() => void markVisible(), 900);
    };
    const onLeave = () => void markVisible(true);
    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      void markVisible(true);
      stopped = true;
      window.clearTimeout(readTimer);
      window.clearTimeout(keepTimer);
      observer.disconnect();
      mutations.disconnect();
      viewport?.removeEventListener('resize', holdBottom);
      document.removeEventListener('focusin', onFocus);
      window.removeEventListener('pagehide', onLeave);
      scroller?.removeEventListener('scroll', onScroll);
      scrollerRef.current = null;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentUser.id, id, markRead, ready]);

  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    let disconnect: (() => void) | undefined;
    void contentRef.current?.getScrollElement().then(element => {
      if (!stopped) disconnect = observeComposerViewport(element, stickRef, contentRef.current?.closest('ion-page')?.querySelector<HTMLElement>('.chat-footer'));
    });
    return () => { stopped = true; disconnect?.(); };
  }, [id, ready]);

  useEffect(() => {
    if (!id) return;
    const onLayout = (event: Event) => {
      const roomId = (event as CustomEvent<{ conversationId?: string }>).detail?.conversationId;
      if (roomId !== id) return;
      const scroller = scrollerRef.current;
      stickRef.current = true;
      if (scroller) stickThread(scroller, stickRef);
    };
    window.addEventListener('chatx-thread-layout', onLayout);
    return () => window.removeEventListener('chatx-thread-layout', onLayout);
  }, [id]);

  useEffect(() => {
    if (!ready || searching) return;
    const previous = lengthRef.current;
    lengthRef.current = messages.length;
    const added = messages.filter((message) => !seenIds.current.has(message.id));
    seenIds.current = new Set(messages.map((message) => message.id));
    const ownSend = added.some((message) => message.senderId === currentUser.id && (message.status === 'pending' || message.status === 'sending'));
    if (ownSend) {
      const ownMedia = added.some((message) => message.senderId === currentUser.id && (message.type === 'image' || message.type === 'video'));
      stickRef.current = true;
      placedRef.current = true;
      setAway(false);
      setFresh(0);
      if (focusId) setParams({}, { replace: true });
      const followMs = ownMedia ? 3200 : 700;
      const scroller = scrollerRef.current;
      if (scroller) beginSendGlide(scroller, followMs);
      else void contentRef.current?.getScrollElement().then((element) => {
        if (element) beginSendGlide(element, followMs);
      });
      return;
    }
    if (focusId) {
      stickRef.current = false;
      placedRef.current = true;
      return;
    }
    if (!placedRef.current && messages.length > 0) {
      const total = messages.length;
      let unread = roomUnreadCount(id, currentUser.id, messages);
      openedUnread.current = unread;
      if (arrivalUnread !== unread) setArrivalUnread(unread);
      if (unread <= 0) {
        const limit = useChatStore.getState().historyLimit[id] ?? MESSAGE_PAGE_SIZE;
        if (limit > MESSAGE_PAGE_SIZE) {
          useChatStore.setState((state) => ({ historyLimit: { ...state.historyLimit, [id]: MESSAGE_PAGE_SIZE } }));
          return;
        }
      }
      if (unread > 0) {
        const limit = useChatStore.getState().historyLimit[id] ?? MESSAGE_PAGE_SIZE;
        const next = historyLimitForUnread(unread, limit, total);
        if (next > limit) {
          useChatStore.setState((state) => ({ historyLimit: { ...state.historyLimit, [id]: next } }));
          return;
        }
      }
      stickRef.current = unread <= 0;
      let alive = true;
      let tries = 0;
      const step = async () => {
        if (!alive || placedRef.current) return;
        const scroller = await contentRef.current?.getScrollElement();
        if (!alive || !scroller) return;
        unread = roomUnreadCount(id, currentUser.id, messagesRef.current);
        openedUnread.current = unread;
        if (arrivalUnread !== unread) setArrivalUnread(unread);
        if (unread <= 0) {
          stickRef.current = true;
          setArrivalUnread(0);
          settleBottom(scroller, () => {
            if (!alive) return;
            placedRef.current = true;
          });
          return;
        }
        if (pinToUnread(scroller)) {
          const gap = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
          stickRef.current = gap < 96;
          placedRef.current = true;
          return;
        }
        if (tries < 24) {
          tries += 1;
          window.requestAnimationFrame(() => { void step(); });
          return;
        }
        stickRef.current = true;
        settleBottom(scroller, () => {
          if (!alive) return;
          placedRef.current = true;
        });
      };
      void step();
      return () => {
        alive = false;
      };
    }
    if (messages.length > previous && stickRef.current) {
      const scroller = scrollerRef.current;
      if (scroller) stickThread(scroller, stickRef);
      return;
    }
    if (messages.length > previous) setFresh((count) => count + (messages.length - previous));
  }, [arrivalUnread, conversation?.unreadCount, currentUser.id, focusId, id, messages, ready, resumeBack, roomHistoryLimit, searching, setParams]);

  useEffect(() => {
    if (!stickRef.current) return;
    const scroller = scrollerRef.current;
    if (scroller) pinBottom(scroller);
  }, [typingIds.length]);

  useEffect(() => {
    if (focusId || !stickRef.current) return;
    const scroller = scrollerRef.current;
    if (scroller) pinBottom(scroller);
    else void contentRef.current?.scrollToBottom(0);
  }, [focusId]);

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
      if (savedRef.current && event.composedPath().includes(savedRef.current)) navigate(`/saved?room=${encodeURIComponent(id)}`, { replace: true });
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

  const revealOlder = useCallback(async () => {
    const scroller = await contentRef.current?.getScrollElement();
    const before = scroller?.scrollHeight ?? 0;
    const top = scroller?.scrollTop ?? 0;
    const loaded = await loadOlder(id);
    if (scroller && loaded) {
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      const delta = scroller.scrollHeight - before;
      if (delta > 0) scroller.scrollTop = top + delta;
    }
    return loaded;
  }, [id, loadOlder]);

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
  const peerGone = deletedPrivatePeer(conversation, currentUser.id, users);
  const members = membersOf(conversation, users);
  const onlineCount = members.filter((user) => getUserPresence(user.id, users) === 'online').length;
  const typingNames = typingIds
    .filter((userId) => userId !== currentUser.id)
    .map((userId) => users.find((user) => user.id === userId)?.displayName)
    .filter((name): name is string => Boolean(name));
  const typingLine = typingLabel(typingNames);
  const groupSubtitle = typingLine || (currentUser.status === 'online'
    ? onlineCount === 0
      ? 'لا أحد متصل'
      : `${onlineCount} متصل`
    : `${onlineCount === 0 ? 'لا أحد متصل' : `${onlineCount} متصل`} · ${connectionLabel(currentUser)}`);
  const privateSubtitle = typingLine || (other ? connectionLabel(other) : '');
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
                  subtitle={groupSubtitle}
                  online={!typingLine && onlineCount > 0}
                  typing={Boolean(typingLine)}
                />
              </button>
            ) : conversation.self ? (
              <div className="chat-nav-main">
                <Avatar name={currentUser.displayName} color={currentUser.color} size={32} src={currentUser.avatarUrl} />
                <GroupHeader title={currentUser.displayName} subtitle="رسائلك" online={false} />
              </div>
            ) : peerGone ? (
              <div className="chat-nav-main">
                <Avatar name="حساب محذوف" color="#8ea099" size={32} />
                <GroupHeader title="حساب محذوف" subtitle="تم حذف هذا الحساب" online={false} />
              </div>
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
                    <GroupHeader
                      title={other.displayName}
                      subtitle={privateSubtitle}
                      online={!typingLine && getUserPresence(other.id, users) === 'online'}
                      typing={Boolean(typingLine)}
                    />
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
                  setSearchOpen((open) => {
                    if (open) {
                      if (window.history.state?.chatxOverlay) dismissOverlayHistory();
                      else closeSearch();
                      return false;
                    }
                    setSearchQuery('');
                    return true;
                  });
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
      <IonContent ref={contentRef} className="chat-scroll">
        {notice ? <p className="focus-miss" role="status">{notice}</p> : null}
        {focusMiss && <p className="focus-miss" role="status">تعذر العثور على الرسالة</p>}
        <div className="chat-thread">
          {!ready ? (
            skeleton ? <PageSkeleton kind="chat" /> : null
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
              resumeBack={resumeBack}
              spotlightId={spotlight}
              onOpenProfile={setProfile}
              onLoadOlder={revealOlder}
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
            void revealOlder().then(() => {
              const node = document.getElementById('unread-anchor');
              const scroller = scrollerRef.current;
              if (!node || !scroller) return;
              const top = scroller.scrollTop + node.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
              scroller.scrollTop = Math.max(0, top);
            });
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
          const pin = () => {
            const scroller = scrollerRef.current;
            if (scroller) pinBottom(scroller);
            else void contentRef.current?.scrollToBottom(0);
          };
          pin();
          requestAnimationFrame(() => {
            pin();
            requestAnimationFrame(pin);
          });
        }}>
          <IonIcon icon={arrowDown} />
          {fresh > 0 ? <span>{fresh}</span> : null}
        </button>
      )}
      <IonFooter className="chat-footer">
        {peerGone ? (
          <div className="deleted-peer">
            <p>تم حذف هذا الحساب</p>
            <button
              type="button"
              onClick={() => {
                void useChatStore.getState().dismissDeletedChat(conversation.id).then((ok) => {
                  if (ok) navigate('/home');
                });
              }}
            >
              إزالة المحادثة
            </button>
          </div>
        ) : (
          <MessageComposer conversationId={conversation.id} />
        )}
      </IonFooter>
      <UserProfileModal
        user={profile}
        isSelf={profile?.id === currentUser.id}
        room={conversation.type !== 'private' ? { name: conversation.name ?? 'مجموعة', adminId: conversation.adminId } : undefined}
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
