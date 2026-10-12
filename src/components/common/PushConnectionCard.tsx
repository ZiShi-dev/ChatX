import { useEffect, useState, useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { hasFcmToken, onPushTokenReady, refreshPushRegistration } from '../../lib/pushRegister';
import { fcmEnabled } from '../../lib/fcmEnabled';
import { useAuthStore } from '../../stores/authStore';

export default function PushConnectionCard() {
  const ready = useSyncExternalStore(onPushTokenReady, hasFcmToken, () => false);
  const userId = useAuthStore(state => state.currentUser.id);
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    void PushNotifications.listChannels().then(({ channels }) => {
      if (active) setMuted(channels.some(channel => channel.id === 'chatx-messages' && Number(channel.importance) === 0));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [ready, busy]);
  if (!Capacitor.isNativePlatform()) return null;
  return <article className="setting-card column">
    <strong>الإشعارات الفورية</strong>
    <p>{!fcmEnabled() ? 'هذه النسخة لا تفعّل Firebase. ثبّت النسخة الحديثة.' : ready ? 'Firebase: الهاتف مسجل لدى الخادم لاستقبال الإشعارات الفورية.' : 'Firebase: التسجيل لم يكتمل. التحقق الدوري البديل قد يؤخر الإشعارات.'}</p>
    {muted && <p className="form-error">قناة الرسائل مكتومة في إعدادات أندرويد. فعّلها من التطبيقات ← ChatX ← الإشعارات.</p>}
    <button type="button" className="setting-allow" disabled={busy || !fcmEnabled()} onClick={async () => {
      setBusy(true); setError('');
      try { await refreshPushRegistration(userId); } catch { setError('تعذر إعادة الاتصال. تأكد من الشبكة وإذن الإشعارات، ثم أعد المحاولة.'); }
      finally { setBusy(false); }
    }}>{busy ? 'جارٍ إعادة الاتصال…' : 'إعادة ربط الإشعارات'}</button>
    {error && <p className="form-error">{error}</p>}
  </article>;
}
