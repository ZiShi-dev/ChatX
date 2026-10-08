import { useEffect, useMemo, useState } from 'react';
import { IonContent, IonHeader, IonIcon, IonPage } from '@ionic/react';
import { bookmark } from 'ionicons/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import EmptyState from '../components/common/EmptyState';
import PageSkeleton from '../components/common/PageSkeleton';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import PageNav from '../components/common/PageNav';
import { formatConversationTime } from '../lib/conversation';
import { savedFor } from '../lib/saved';
import { useAuthStore } from '../stores/authStore';
import { useSavedStore } from '../stores/savedStore';
import type { MessageType } from '../types/message';

const KIND: Record<MessageType, string> = {
  text: 'نص',
  image: 'صورة',
  video: 'فيديو',
  link: 'رابط',
  file: 'ملف',
};

export default function SavedPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const room = params.get('room') ?? '';
  const currentUser = useAuthStore((state) => state.currentUser);
  const entries = useSavedStore((state) => state.entries);
  const load = useSavedStore((state) => state.load);
  const remove = useSavedStore((state) => state.remove);
  const hasMore = useSavedStore((state) => state.hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scope, setScope] = useState<'room' | 'all'>(room ? 'room' : 'all');
  const [ready, setReady] = useState(entries.length > 0);

  useEffect(() => {
    let alive = true;
    void load()
      .catch(() => {
        if (alive) setError('تعذر تحميل المحفوظات. أعد المحاولة.');
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [load, currentUser.id]);

  const mine = useMemo(() => savedFor(entries, currentUser.id), [currentUser.id, entries]);
  const visible = scope === 'room' && room ? mine.filter((item) => item.conversationId === room) : mine;

  return (
    <IonPage>
      <IonHeader>
        <NetworkStatusBanner />
        <PageNav title="المحفوظات" fallback={room ? `/chat/${room}` : '/home'} />
      </IonHeader>
      <IonContent className="inbox-page">
        <p className="inbox-lead">الرسائل التي تحفظها تبقى لك، من المجموعات والمحادثات الخاصة.</p>
        {error && <p role="alert">{error}</p>}
        {room && (
          <div className="inbox-filters" role="tablist" aria-label="نطاق المحفوظات">
            <button type="button" role="tab" aria-selected={scope === 'room'} className={scope === 'room' ? 'is-on' : undefined} onClick={() => setScope('room')}>
              هذه المحادثة
            </button>
            <button type="button" role="tab" aria-selected={scope === 'all'} className={scope === 'all' ? 'is-on' : undefined} onClick={() => setScope('all')}>
              الكل
            </button>
          </div>
        )}
        {visible.length === 0 && !ready ? (
          <PageSkeleton kind="saved" />
        ) : visible.length === 0 ? (
          <EmptyState title="لا توجد رسائل محفوظة" detail="اضغط مطولاً على أي رسالة ثم اختر حفظ." />
        ) : (
          <div className="inbox-list">
            {visible.map((item) => (
              <div key={`${item.userId}-${item.messageId}`} className="inbox-row">
                <button type="button" className="saved-open" onClick={() => navigate(`/chat/${item.conversationId}?at=${item.messageId}`)}>
                  <span className="inbox-copy">
                    <span className="inbox-line">
                      <strong>{item.senderName}</strong>
                      <em>{formatConversationTime(item.createdAt)}</em>
                    </span>
                    <span className="inbox-meta">
                      <span>{item.conversationName}</span>
                      <span className="kind-pill">{KIND[item.type]}</span>
                    </span>
                    <span className="inbox-preview">{item.preview}</span>
                  </span>
                </button>
                <button type="button" className="saved-drop" aria-label="إلغاء الحفظ" onClick={() => remove(currentUser.id, item.messageId)}>
                  <IonIcon icon={bookmark} />
                </button>
              </div>
            ))}
          </div>
        )}
        {hasMore && <button type="button" disabled={loading} onClick={async () => {
          setLoading(true); setError('');
          try { await load(true); } catch { setError('تعذر تحميل المحفوظات. أعد المحاولة.'); }
          finally { setLoading(false); }
        }}>تحميل المزيد</button>}
      </IonContent>
    </IonPage>
  );
}
