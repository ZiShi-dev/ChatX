import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { startPolling } from '../lib/poll';
import { isServerId } from '../lib/home';
import { presentInbox, unseenInboxAlerts } from '../lib/inbox';
import { InboxWatch } from '../lib/inboxWatch';
import { notifyChatMessage } from '../lib/notifications';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { quietLevel, useMuteStore } from '../stores/muteStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useUserStore } from '../stores/userStore';

const HTTPS_ORIGIN = /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/;

function rememberPhoneWatch() {
  if (!Capacitor.isNativePlatform()) return;
  const origin = String(import.meta.env.VITE_API_ORIGIN ?? '').trim().replace(/\/$/, '');
  if (!HTTPS_ORIGIN.test(origin)) return;
  const quiet = useMuteStore.getState().mutes.map((item) => `${item.conversationId}=${quietLevel(item)}`).join(',');
  const hiddenKinds = Object.entries(useSettingsStore.getState().notifyTypes)
    .filter(([, enabled]) => !enabled)
    .map(([kind]) => kind)
    .join(',');
  const seen = useChatStore.getState().serverInbox.slice(0, 30).map((item) => item.id);
  void InboxWatch.remember({ origin, quiet, hiddenKinds, seen }).catch(() => undefined);
}

export function useInboxAlerts() {
  const activated = useAuthStore((state) => state.activated);
  const userId = useAuthStore((state) => state.currentUser.id);

  useEffect(() => {
    if (!activated || !isServerId(userId)) return;
    const known = new Set<string>();
    let primed = false;
    let stopped = false;

    const tick = async () => {
      const result = await useChatStore.getState().loadInbox();
      if (stopped || result !== 'ok') return;
      rememberPhoneWatch();
      const items = presentInbox(
        useChatStore.getState().serverInbox.slice(0, 30),
        useMuteStore.getState().mutes,
        useSettingsStore.getState().notifyTypes,
      );
      const fresh = unseenInboxAlerts(known, items);
      known.clear();
      items.forEach((item) => known.add(item.id));
      if (!primed) {
        primed = true;
        return;
      }
      if (document.visibilityState !== 'hidden') return;
      const users = useUserStore.getState().users;
      fresh.forEach((item) => {
        const sender = users.find((user) => user.id === item.senderId);
        void notifyChatMessage({
          conversationId: item.conversationId,
          kind: 'group',
          title: item.senderName || sender?.displayName || 'ChatX',
          body: item.preview,
          tag: item.id,
          mention: item.kind,
        });
      });
    };

    // Android's native watcher already checks notifications in the background.
    const stop = startPolling(tick, { background: !Capacitor.isNativePlatform(), economy: true });
    return () => {
      stopped = true;
      stop();
      if (Capacitor.isNativePlatform()) void InboxWatch.stop().catch(() => undefined);
    };
  }, [activated, userId]);
}
