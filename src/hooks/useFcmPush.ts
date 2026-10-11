import { useEffect } from 'react';
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

export function useFcmPush() {
  const navigate = useNavigate();
  const activated = useAuthStore((state) => state.activated);
  const userId = useAuthStore((state) => state.currentUser.id);

  useEffect(() => {
    if (!fcmEnabled() || !activated || !isServerId(userId)) return;

    void startPushRegistration(userId).catch(() => undefined);
    const opened = (event: Event) => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path;
      if (path && /^\/chat\/[^/?]+(?:\?at=[^&]+)?$/.test(path)) openNotificationChat(navigate, path);
    };
    let refresh: ReturnType<typeof setTimeout> | undefined;
    const received = (event: Event) => {
      const roomId = (event as CustomEvent<{ conversationId?: string }>).detail?.conversationId;
      clearTimeout(refresh);
      refresh = setTimeout(() => {
        void useChatStore.getState().loadInbox();
        if (roomId && window.location.pathname === `/chat/${roomId}`) void useChatStore.getState().loadRoom(roomId);
      }, 200);
    };
    window.addEventListener('chatx-push-open', opened);
    window.addEventListener('chatx-push-received', received);
    const resumed = App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      syncPushPrefs();
      void useChatStore.getState().loadInbox();
    });

    const unsubMutes = useMuteStore.subscribe((state, previous) => {
      if (state.mutes !== previous.mutes) syncPushPrefs();
    });
    const unsubSettings = useSettingsStore.subscribe((state, previous) => {
      if (state.notifyTypes !== previous.notifyTypes) syncPushPrefs();
    });

    return () => {
      clearTimeout(refresh);
      window.removeEventListener('chatx-push-open', opened);
      window.removeEventListener('chatx-push-received', received);
      void resumed.then(handle => handle.remove());
      unsubMutes();
      unsubSettings();
      void stopPushRegistration().catch(() => undefined);
    };
  }, [activated, userId, navigate]);
}
