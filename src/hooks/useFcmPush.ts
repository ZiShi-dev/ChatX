import { useEffect } from 'react';
import { fcmEnabled } from '../lib/fcmEnabled';
import { isServerId } from '../lib/home';
import { startPushRegistration, stopPushRegistration, syncPushPrefs } from '../lib/pushRegister';
import { useAuthStore } from '../stores/authStore';
import { useMuteStore } from '../stores/muteStore';
import { useSettingsStore } from '../stores/settingsStore';

export function useFcmPush() {
  const activated = useAuthStore((state) => state.activated);
  const userId = useAuthStore((state) => state.currentUser.id);

  useEffect(() => {
    if (!fcmEnabled() || !activated || !isServerId(userId)) return;

    void startPushRegistration(userId).catch(() => undefined);

    const unsubMutes = useMuteStore.subscribe((state, previous) => {
      if (state.mutes !== previous.mutes) syncPushPrefs();
    });
    const unsubSettings = useSettingsStore.subscribe((state, previous) => {
      if (state.notifyTypes !== previous.notifyTypes) syncPushPrefs();
    });

    return () => {
      unsubMutes();
      unsubSettings();
      void stopPushRegistration().catch(() => undefined);
    };
  }, [activated, userId]);
}
