import { useEffect } from 'react';
import { IonToolbar } from '@ionic/react';
import { useChatStore } from '../../stores/chatStore';
import { useSavedStore } from '../../stores/savedStore';
import { useI18n } from '../../lib/i18n';

const ERROR_DISMISS_MS = 12_000;

function isConnectionNotice(error: string, t: (key: 'messageLimit.sendConnection' | 'errors.loadMessagesFailed') => string) {
  return error === t('messageLimit.sendConnection') || error.startsWith(t('errors.loadMessagesFailed'));
}

export default function NetworkStatusBanner() {
  const chatError = useChatStore((state) => state.lastError);
  const savedError = useSavedStore((state) => state.lastError);
  const error = chatError || savedError;
  const { t } = useI18n();
  const connectionNotice = Boolean(error) && isConnectionNotice(error, t);

  useEffect(() => {
    if (!error || connectionNotice) return;
    const timer = window.setTimeout(() => {
      useChatStore.setState({ lastError: '' });
      useSavedStore.setState({ lastError: '' });
    }, ERROR_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [connectionNotice, error]);

  if (!error || connectionNotice) return null;

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
          aria-label={t('network.close')}
        >
          ×
        </button>
      </p>
    </IonToolbar>
  );
}
