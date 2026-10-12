import { useEffect, useRef } from 'react';
import { fcmEnabled } from '../lib/fcmEnabled';
import { isServerId } from '../lib/home';
import { startPushRegistration, stopPushRegistration, syncPushPrefs } from '../lib/pushRegister';
import { useAuthStore } from '../stores/authStore';
import { useMuteStore } from '../stores/muteStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useNavigate } from 'react-router-dom';
import { openNotificationChat } from '../lib/notificationNavigation';
import { useChatStore } from '../stores/chatStore';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { clearReadPushNotifications } from '../lib/readPushNotifications';
import { showPushPreview } from '../lib/pushPreview';

export function useFcmPush() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const activated = useAuthStore((state) => state.activated);
  const userId = useAuthStore((state) => state.currentUser.id);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !fcmEnabled() || !activated || !isServerId(userId)) return;

    void startPushRegistration(userId).catch(() => undefined);
    const opened = (event: Event) => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path;
      if (path && /^\/chat\/[^/?]+(?:\?[^#]+)?$/.test(path)) openNotificationChat(navigateRef.current, path);
    };
    let refresh: ReturnType<typeof setTimeout> | undefined;
    let clearRead: ReturnType<typeof setTimeout> | undefined;
    const cleanupRead = (items: Parameters<typeof clearReadPushNotifications>[0]) => {
      clearTimeout(clearRead);
      clearRead = setTimeout(() => { void clearReadPushNotifications(items).catch(() => undefined); }, 250);
    };
    const unsubRead = useChatStore.subscribe((state, previous) => {
      if (state.serverInbox === previous.serverInbox) return;
      const cleared = state.serverInbox.length === 0 && previous.serverInbox.length > 0
        ? previous.serverInbox.map((item) => ({ ...item, unread: false, unreadCount: 0 }))
        : state.serverInbox;
      cleanupRead(cleared);
    });
    cleanupRead(useChatStore.getState().serverInbox);
    const receivedRooms = new Set<string>();
    const received = (event: Event) => {
      showPushPreview((event as CustomEvent).detail);
      const roomId = (event as CustomEvent<{ conversationId?: string }>).detail?.conversationId;
      if (roomId) receivedRooms.add(roomId);
      clearTimeout(refresh);
      refresh = setTimeout(() => {
        void useChatStore.getState().loadInbox();
        const active = window.location.pathname.match(/^\/chat\/([^/]+)\/?$/)?.[1];
        if (active && receivedRooms.has(active)) void useChatStore.getState().loadRoom(active);
        receivedRooms.clear();
      }, 200);
    };
    window.addEventListener('chatx-push-open', opened);
    window.addEventListener('chatx-push-received', received);
    const resumed = App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      syncPushPrefs();
      void useChatStore.getState().loadInbox();
      const active = window.location.pathname.match(/^\/chat\/([^/]+)\/?$/)?.[1];
      if (active) void useChatStore.getState().loadRoom(active);
    });

    const unsubMutes = useMuteStore.subscribe((state, previous) => {
      if (state.mutes !== previous.mutes) syncPushPrefs();
    });
    const unsubSettings = useSettingsStore.subscribe((state, previous) => {
      if (state.notifyTypes !== previous.notifyTypes) syncPushPrefs();
    });

    return () => {
      clearTimeout(refresh);
      clearTimeout(clearRead);
      unsubRead();
      window.removeEventListener('chatx-push-open', opened);
      window.removeEventListener('chatx-push-received', received);
      void resumed.then(handle => handle.remove());
      unsubMutes();
      unsubSettings();
      void stopPushRegistration().catch(() => undefined);
    };
  }, [activated, userId]);
}
