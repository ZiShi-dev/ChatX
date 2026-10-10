import { useEffect } from 'react';
import { startPolling } from '../lib/poll';
import { adminFetch } from '../lib/adminApi';
import { readPresenceUsers } from '../lib/presence';
import { useAuthStore } from '../stores/authStore';

const SERVER_ID = /^[0-9a-f-]{36}$/i;

export function usePresenceSync() {
  const activated = useAuthStore((state) => state.activated);
  const userId = useAuthStore((state) => state.currentUser.id);

  useEffect(() => {
    if (!activated || !SERVER_ID.test(userId)) return;
    let stopped = false;

    const beat = () => {
      const status = document.visibilityState === 'hidden' ? 'away' : 'online';
      return adminFetch('/api/presence', { method: 'POST', body: { status } })
        .then(() => adminFetch('/api/presence'))
        .then((payload) => {
          if (stopped) return;
          const rows = readPresenceUsers(payload);
          if (rows) useAuthStore.getState().applyPresence(rows);
        })
        .catch(() => {
          if (!stopped) useAuthStore.getState().markSelfOffline();
        });
    };

    const stop = startPolling(beat, { economy: true });
    const onHide = () => {
      if (document.visibilityState === 'hidden' && navigator.onLine !== false) {
        void adminFetch('/api/presence', { method: 'POST', body: { status: 'away' } }).catch(() => undefined);
      }
    };
    const onOffline = () => useAuthStore.getState().markSelfOffline();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('offline', onOffline);
    return () => {
      stopped = true;
      stop();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('offline', onOffline);
      void adminFetch('/api/presence', { method: 'POST', body: { status: 'away' } }).catch(() => undefined);
    };
  }, [activated, userId]);
}
