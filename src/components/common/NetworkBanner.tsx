import { IonToolbar } from '@ionic/react';
import { offlineBannerLabel } from '../../lib/queue';
import { useChatStore } from '../../stores/chatStore';
import { useNetworkStore } from '../../stores/networkStore';
import { useSavedStore } from '../../stores/savedStore';

export default function NetworkStatusBanner() {
  const network = useNetworkStore((state) => state.network);
  const chatError = useChatStore((state) => state.lastError);
  const savedError = useSavedStore((state) => state.lastError);
  const error = chatError || savedError;
  const pending = useChatStore((state) => state.messages.reduce((count, message) => count + (message.status === 'pending' ? 1 : 0), 0));
  if (error) return <IonToolbar className="network-toolbar"><p className="network-banner" role="alert">{error} <button type="button" onClick={() => { useChatStore.setState({ lastError: '' }); useSavedStore.setState({ lastError: '' }); }} aria-label="إغلاق">×</button></p></IonToolbar>;
  if (network === 'online') return null;
  const offline = network === 'offline';
  return (
    <IonToolbar className={offline ? 'network-toolbar' : 'network-toolbar slow'}>
      <p className="network-banner">{offline ? offlineBannerLabel(pending) : 'الاتصال ضعيف'}</p>
    </IonToolbar>
  );
}
