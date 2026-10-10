import { useEffect } from 'react';
import { IonToolbar } from '@ionic/react';
import { nativeNeedsApiOrigin } from '../../lib/apiOrigin';
import { offlineBannerLabel } from '../../lib/queue';
import { useChatStore } from '../../stores/chatStore';
import { useNetworkStore } from '../../stores/networkStore';
import { useSavedStore } from '../../stores/savedStore';

const ERROR_DISMISS_MS = 12_000;

export default function NetworkStatusBanner() {
  const network = useNetworkStore((state) => state.network);
  const chatError = useChatStore((state) => state.lastError);
  const savedError = useSavedStore((state) => state.lastError);
  const error = chatError || savedError;
  const pending = useChatStore((state) => state.messages.reduce((count, message) => count + (message.status === 'pending' ? 1 : 0), 0));

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => {
      useChatStore.setState({ lastError: '' });
      useSavedStore.setState({ lastError: '' });
    }, ERROR_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [error]);

  if (nativeNeedsApiOrigin()) {
    return (
      <IonToolbar className="network-toolbar setup">
        <p className="network-banner" role="status">لم يُضبط عنوان الخادم. افتح الإعدادات → الخادم.</p>
      </IonToolbar>
    );
  }

  if (error) {
    return (
      <IonToolbar className="network-toolbar">
        <p className="network-banner" role="alert">
          {error}
          <button
            type="button"
            onClick={() => {
              useChatStore.setState({ lastError: '' });
              useSavedStore.setState({ lastError: '' });
            }}
            aria-label="إغلاق"
          >
            ×
          </button>
        </p>
      </IonToolbar>
    );
  }

  if (network === 'online') return null;
  const offline = network === 'offline';
  return (
    <IonToolbar className={offline ? 'network-toolbar' : 'network-toolbar slow'}>
      <p className="network-banner">{offline ? offlineBannerLabel(pending) : 'الاتصال ضعيف'}</p>
    </IonToolbar>
  );
}
