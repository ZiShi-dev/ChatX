import { useEffect } from 'react';
import { inboxAlertKey, liveAlertText, useLiveInbox, watchingRoom } from '../lib/liveInbox';
import { createNotificationCadence } from '../lib/notificationCadence';
import { Capacitor } from '@capacitor/core';
import { startPolling } from '../lib/poll';
import { isServerId } from '../lib/home';
import { presentInbox } from '../lib/inbox';
import { InboxWatch } from '../lib/inboxWatch';
import { notifyChatMessage } from '../lib/notifications';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { quietLevel, useMuteStore } from '../stores/muteStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useUserStore } from '../stores/userStore';

const notified = new Set<string>();
function watching(conversationId: string) { return watchingRoom(window.location.pathname, conversationId); }

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
  const seen = useChatStore.getState().serverInbox.slice(0, 100).flatMap((item) => (
    !item.unread || notified.has(item.id) || (document.visibilityState !== 'hidden' && watching(item.conversationId)) ? [item.id] : []
  ));
  void InboxWatch.remember({ origin, quiet, hiddenKinds, seen }).catch(() => undefined);
}

export function useInboxAlerts() {
  const activated = useAuthStore((state) => state.activated);
  const userId = useAuthStore((state) => state.currentUser.id);

  useEffect(() => {
    if (!activated || !isServerId(userId)) return;
    const known = new Set<string>();
    const cadence = createNotificationCadence();
    let primed = false;
    let stopped = false;

    const inspect = () => {
      if (stopped || useAuthStore.getState().currentUser.id !== userId) return;
      const items = useChatStore.getState().serverInbox.slice(0, 100).flatMap(item => presentInbox(
        [item],
        useMuteStore.getState().mutes,
        useSettingsStore.getState().notifyTypes,
      ));
      const fresh = items.filter(item => !item.suppressed && !known.has(inboxAlertKey(item)));
      items.forEach((item) => known.add(inboxAlertKey(item)));
      while (known.size > 300) known.delete(known.values().next().value!);
      if (!primed) {
        primed = true;
        items.forEach((item) => notified.add(item.id));
        rememberPhoneWatch();
        return;
      }
      const users = useUserStore.getState().users;
      const hidden = document.visibilityState === 'hidden';
      fresh.reverse().forEach((item) => {
        if (hidden && !item.unread) return;
        notified.add(item.id);
        const sender = users.find((user) => user.id === item.senderId);
        const alert = liveAlertText(item, sender?.displayName);
        if (!hidden) {
          useLiveInbox.getState().push({ key: inboxAlertKey(item), conversationId: item.conversationId, messageId: item.id, kind: item.kind, title: alert.title, body: alert.body });
          return;
        }
        void notifyChatMessage({
          conversationId: item.conversationId,
          kind: useChatStore.getState().conversations.find(room => room.id === item.conversationId)?.type === 'group' ? 'group' : 'private',
          title: alert.title,
          body: alert.body,
          mention: item.kind,
        }).catch(() => undefined);
      });
      while (notified.size > 400) notified.delete(notified.values().next().value!);
      rememberPhoneWatch();
    };
    const tick = async () => {
      const result = await useChatStore.getState().loadInbox();
      if (result === 'ok') {
        const state = useChatStore.getState();
        cadence.observe(state.serverInbox, state.serverUnread);
        inspect();
      }
      return result;
    };
    const unsubscribe = useChatStore.subscribe((state, previous) => { if (state.serverInbox !== previous.serverInbox) inspect(); });

    const unsubscribeMutes = useMuteStore.subscribe((state, previous) => { if (state.mutes !== previous.mutes) rememberPhoneWatch(); });
    const unsubscribeSettings = useSettingsStore.subscribe((state, previous) => { if (state.notifyTypes !== previous.notifyTypes) rememberPhoneWatch(); });

    // Android's native watcher checks the inbox once the app leaves the screen.
    const stop = startPolling(tick, { background: !Capacitor.isNativePlatform(), backgroundInterval: () => cadence.delay(true), interval: () => cadence.delay() });
    return () => {
      stopped = true;
      stop();
      unsubscribe();
      unsubscribeMutes();
      unsubscribeSettings();
      useLiveInbox.getState().clear();
      notified.clear();
      if (Capacitor.isNativePlatform()) {
        notified.clear();
        void InboxWatch.stop().catch(() => undefined);
      }
    };
  }, [activated, userId]);
}
