import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import PermissionDialog from './PermissionDialog';
import { App as CapApp } from '@capacitor/app';
import {
  readChatNotificationPermission,
  requestChatNotificationPermission,
  subscribeChatNotificationPermission,
  type ChatNotificationPermission,
} from '../../lib/notifications';
import { useAuthStore } from '../../stores/authStore';

type NotificationPermissionProps = {
  compact?: boolean;
};

const copy: Record<ChatNotificationPermission, string> = {
  prompt: 'اسمح لأندرويد بعرض إشعارات المجموعات والمحادثات الخاصة.',
  granted: 'مفعّلة للمجموعات والمحادثات الخاصة.',
  denied: 'مرفوضة. فعّلها من إعدادات أندرويد لهذا التطبيق.',
};

export default function NotificationPermissionCard({ compact = false }: NotificationPermissionProps) {
  const [permission, setPermission] = useState<ChatNotificationPermission | null>(null);
  const [ask, setAsk] = useState(false);

  useEffect(() => {
    const stop = subscribeChatNotificationPermission(setPermission);
    void readChatNotificationPermission();
    return stop;
  }, []);

  if (!permission || (compact && permission !== 'prompt')) return null;

  return (
    <article className={compact ? 'notice-banner' : 'setting-card column'}>
      {!compact && <strong>إشعارات الرسائل</strong>}
      <p>{copy[permission]}</p>
      {permission !== 'granted' && (
        <button type="button" className="setting-allow" onClick={() => setAsk(true)}>
          السماح بالإشعارات
        </button>
      )}
      {ask && (
        <PermissionDialog
          title="الإشعارات"
          body={copy[permission]}
          allowLabel="السماح بالإشعارات"
          onAllow={() => {
            setAsk(false);
            void requestChatNotificationPermission();
          }}
          onLater={() => setAsk(false)}
        />
      )}
    </article>
  );
}

export function NotificationPermissionDialog() {
  const activated = useAuthStore((state) => state.activated);
  const [permission, setPermission] = useState<ChatNotificationPermission | null>(null);
  const [open, setOpen] = useState(false);
  const permissionRef = useRef<ChatNotificationPermission | null>(null);
  const skipped = useRef(false);

  useEffect(() => {
    const stop = subscribeChatNotificationPermission((value) => {
      permissionRef.current = value;
      setPermission(value);
      if (value === 'granted') {
        setOpen(false);
        return;
      }
      if (useAuthStore.getState().activated && !skipped.current) setOpen(true);
    });
    void readChatNotificationPermission();
    return stop;
  }, []);

  useEffect(() => {
    if (!activated) {
      skipped.current = false;
      setOpen(false);
      return;
    }
    const ask = () => {
      const current = permissionRef.current;
      if (!current || current === 'granted' || skipped.current) return;
      setOpen(true);
    };
    ask();
    const onVisible = () => {
      if (document.visibilityState === 'hidden') skipped.current = false;
      else ask();
    };
    document.addEventListener('visibilitychange', onVisible);
    let removeNative = () => undefined;
    if (Capacitor.isNativePlatform()) {
      const pending = CapApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) skipped.current = false;
        else ask();
      });
      removeNative = () => {
        void pending.then((handle) => handle.remove());
      };
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      removeNative();
    };
  }, [activated]);

  if (!activated || !open || !permission || permission === 'granted') return null;

  const later = () => {
    skipped.current = true;
    setOpen(false);
  };
  const allow = () => {
    skipped.current = true;
    setOpen(false);
    void requestChatNotificationPermission();
  };

  return (
    <PermissionDialog
      title="الإشعارات"
      body={copy[permission]}
      allowLabel="السماح بالإشعارات"
      onAllow={allow}
      onLater={later}
    />
  );
}
