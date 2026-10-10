import { useEffect } from 'react';
import { inboxAlertKey, liveAlertText, useLiveInbox, watchingRoom } from '../lib/liveInbox';
import { createNotificationCadence } from '../lib/notificationCadence';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { startPolling } from '../lib/poll';
import { isServerId } from '../lib/home';
import { notificationAvatars, presentInbox } from '../lib/inbox';
import { localRoomKeyRecords } from '../lib/e2e';
import { InboxWatch } from '../lib/inboxWatch';
import { notifyChatMessage } from '../lib/notifications';
import { startPushRegistration, stopPushRegistration, syncPushPrefs } from '../lib/pushRegister';

const fcmEnabled = import.meta.env.VITE_ENABLE_FCM === 'true';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { quietLevel, useMuteStore } from '../stores/muteStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useUserStore } from '../stores/userStore';

const HTTPS_ORIGIN = /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/;

let keySignature = '';
let avatarSignature = '';
const notified = new Set<string>();
let phoneActive = true;

function watching(conversationId: string) {
  return watchingRoom(window.location.pathname, conversationId);
}

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
    !item.unread || notified.has(item.id) || (phoneActive && document.visibilityState !== 'hidden' && watching(item.conversationId)) ? [item.id] : []
  ));
  void InboxWatch.remember({ origin, quiet, hiddenKinds, seen }).catch(() => undefined);
  if (fcmEnabled) syncPushPrefs();
  void localRoomKeyRecords().then((records) => {
    if (!records) return;
    const signature = records.map((item) => `${item.roomId}:${item.keyId}`).sort().join(',');
    if (signature === keySignature) return;
    return InboxWatch.rememberKeys({ keys: records }).then(() => {
      keySignature = signature;
    });
  }).catch(() => undefined);
  const rooms = useChatStore.getState().conversations.filter((room) => isServerId(room.id));
  if (rooms.length === 0) return;
  const avatars = notificationAvatars(rooms);
  const signature = avatars.map((item) => `${item.conversationId}:${item.jpeg.length}:${item.jpeg.slice(-12)}`).sort().join(',');
  if (signature === avatarSignature) return;
  void InboxWatch.rememberAvatars({ avatars }).then(() => {
    avatarSignature = signature;
  }).catch(() => undefined);
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
      const hidden = !phoneActive || document.visibilityState === 'hidden';
      fresh.reverse().forEach((item) => {
        if (hidden && !item.unread) return;
        if (!hidden && watching(item.conversationId)) {
          notified.add(item.id);
          return;
        }
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
    if (fcmEnabled) void startPushRegistration(userId);
    let stopState = () => {};
    if (Capacitor.isNativePlatform()) {
      void CapApp.addListener('appStateChange', ({ isActive }) => {
        phoneActive = isActive;
        if (!isActive) rememberPhoneWatch();
      }).then((handle) => { stopState = () => { void handle.remove(); }; });
    }

    // Android's native watcher checks the inbox once the app leaves the screen.
    const stop = startPolling(tick, {
      background: !Capacitor.isNativePlatform(),
      economy: true,
      backgroundInterval: () => cadence.delay(true),
      interval: () => cadence.delay(),
    });
    return () => {
      stopped = true;
      stop();
      unsubscribe();
      unsubscribeMutes();
      unsubscribeSettings();
      stopState();
      phoneActive = true;
      useLiveInbox.getState().clear();
      notified.clear();
      if (Capacitor.isNativePlatform()) {
        keySignature = '';
        avatarSignature = '';
        notified.clear();
        void InboxWatch.stop().catch(() => undefined);
        if (fcmEnabled) void stopPushRegistration().catch(() => undefined);
      }
    };
  }, [activated, userId]);
}
