import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useMuteStore } from '../stores/muteStore';

export type ChatKind = 'group' | 'private';
export type ChatNotificationPermission = 'granted' | 'denied' | 'prompt';

const CHANNEL_ID = 'chatx-messages';

const watchers = new Set<(value: ChatNotificationPermission) => void>();
let known: ChatNotificationPermission | null = null;

function emit(value: ChatNotificationPermission) {
  known = value;
  watchers.forEach((watch) => watch(value));
}

function normalize(value: string | undefined): ChatNotificationPermission {
  if (value === 'granted') return 'granted';
  if (value === 'denied') return 'denied';
  return 'prompt';
}

export function subscribeChatNotificationPermission(watch: (value: ChatNotificationPermission) => void) {
  watchers.add(watch);
  if (known) watch(known);
  return () => {
    watchers.delete(watch);
  };
}

async function ensureAndroidChannel() {
  if (Capacitor.getPlatform() !== 'android') return;
  await LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: 'الرسائل',
    description: 'إشعارات المجموعات والمحادثات الخاصة',
    importance: 4,
    visibility: 1,
  });
}

export async function readChatNotificationPermission(): Promise<ChatNotificationPermission> {
  try {
    const value = Capacitor.isNativePlatform()
      ? normalize((await LocalNotifications.checkPermissions()).display)
      : typeof Notification === 'undefined'
        ? 'denied'
        : normalize(Notification.permission);
    emit(value);
    return value;
  } catch {
    return known ?? 'prompt';
  }
}

/** Demande à Android (ou au navigateur) l’autorisation d’afficher les notifications, pour un groupe comme pour une discussion privée. */
export async function requestChatNotificationPermission(): Promise<ChatNotificationPermission> {
  const before = known ?? (await readChatNotificationPermission());
  try {
    let next: ChatNotificationPermission;
    if (Capacitor.isNativePlatform()) {
      await ensureAndroidChannel();
      next = normalize((await LocalNotifications.requestPermissions()).display);
    } else if (typeof Notification === 'undefined') {
      next = 'denied';
    } else {
      next = normalize(await Notification.requestPermission());
    }
    emit(next);
    if (before !== 'granted' && next === 'granted') {
      try {
        await notifyChatMessage({
          conversationId: '',
          kind: 'private',
          title: 'ChatX',
          body: 'ستصلك إشعارات المجموعات والمحادثات الخاصة.',
        });
      } catch {
        return next;
      }
    }
    return next;
  } catch {
    return known ?? 'prompt';
  }
}

export async function notifyChatMessage(input: {
  conversationId: string;
  kind: ChatKind;
  title: string;
  body: string;
  tag?: string;
  mention?: boolean | 'everyone';
}) {
  if (input.conversationId && useMuteStore.getState().blocks(input.conversationId, input.mention)) return;
  const permission = known ?? (await readChatNotificationPermission());
  if (permission !== 'granted') return;

  if (Capacitor.isNativePlatform()) {
    await ensureAndroidChannel();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Math.random() * 2_000_000_000) + 1,
          title: input.title,
          body: input.body,
          channelId: CHANNEL_ID,
          extra: {
            conversationId: input.conversationId,
            kind: input.kind,
          },
        },
      ],
    });
    return;
  }

  const notification = new Notification(input.title, {
    body: input.body,
    tag: input.tag || input.conversationId || 'chatx',
  });
  if (!input.conversationId) return;
  notification.onclick = () => {
    window.focus();
    window.location.assign(`/chat/${input.conversationId}`);
  };
}

export async function listenForChatNotificationOpens(open: (conversationId: string) => void) {
  if (!Capacitor.isNativePlatform()) return () => undefined;
  const handle = await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const conversationId = event.notification.extra?.conversationId;
    if (typeof conversationId === 'string' && conversationId) open(conversationId);
  });
  return () => {
    void handle.remove();
  };
}
