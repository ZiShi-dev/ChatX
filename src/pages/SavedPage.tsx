import { openNotificationChat } from '../lib/notificationNavigation';
import { useEffect, useMemo, useState } from 'react';
import { IonContent, IonHeader, IonIcon, IonPage } from '@ionic/react';
import { bookmark } from 'ionicons/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import EmptyState from '../components/common/EmptyState';
import EmojiText from '../components/common/EmojiText';
import PageSkeleton from '../components/common/PageSkeleton';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import PageNav from '../components/common/PageNav';
import { formatConversationTime } from '../lib/conversation';
import { firstUrl } from '../lib/link';
import { savedFor, type SavedEntry } from '../lib/saved';
import { isSafeExternalUrl } from '../lib/url';
import { useAuthStore } from '../stores/authStore';
import { useSavedStore } from '../stores/savedStore';
import type { MessageType } from '../types/message';
import { useI18n, type MessageKey } from '../lib/i18n';
import './SavedPage.css';

const KIND: Record<MessageType, MessageKey> = {
  text: 'saved.kind.text',
  image: 'preview.image',
  video: 'preview.video',
  link: 'preview.link',
  file: 'preview.file',
};

function savedHref(item: SavedEntry) {
  if (item.href && isSafeExternalUrl(item.href)) return item.href;
  const url = firstUrl(item.preview);
  return isSafeExternalUrl(url) ? url : '';
}

export default function SavedPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
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
        if (alive) setError(t('saved.loadError'));
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [load, currentUser.id, t]);

  const mine = useMemo(() => savedFor(entries, currentUser.id), [currentUser.id, entries]);
  const visible = scope === 'room' && room ? mine.filter((item) => item.conversationId === room) : mine;

  const openInChat = (item: SavedEntry) => {
    const path = `/chat/${item.conversationId}?at=${encodeURIComponent(item.messageId)}`;
    openNotificationChat(navigate, path);
  };

  return (
    <IonPage>
      <IonHeader>
        <NetworkStatusBanner />
        <PageNav title={t('saved.title')} fallback={room ? `/chat/${room}` : '/home'} />
      </IonHeader>
      <IonContent className="inbox-page saved-page">
        <p className="inbox-lead saved-lead">{t('saved.lead')}</p>
        {error && <p role="alert">{error}</p>}
        {room && (
          <div className="inbox-filters" role="tablist" aria-label={t('saved.filtersAria')}>
            <button type="button" role="tab" aria-selected={scope === 'room'} className={scope === 'room' ? 'is-on' : undefined} onClick={() => setScope('room')}>
              {t('saved.scopeThis')}
            </button>
            <button type="button" role="tab" aria-selected={scope === 'all'} className={scope === 'all' ? 'is-on' : undefined} onClick={() => setScope('all')}>
              {t('saved.scopeAll')}
            </button>
          </div>
        )}
        {visible.length === 0 && !ready ? (
          <PageSkeleton kind="saved" />
        ) : visible.length === 0 ? (
          <EmptyState title={t('saved.emptyTitle')} detail={t('saved.emptyDetail')} />
        ) : (
          <div className="inbox-list">
            {visible.map((item) => {
              const href = savedHref(item);
              return (
                <div key={`${item.userId}-${item.messageId}`} className="inbox-row saved-row">
                  <button type="button" className="saved-open" onClick={() => openInChat(item)}>
                    <span className="inbox-copy">
                      <span className="inbox-line">
                        <strong>{item.senderName}</strong>
                        <em>{formatConversationTime(item.createdAt)}</em>
                      </span>
                      <span className="inbox-meta">
                        <span>{item.conversationName}</span>
                        <span className="kind-pill">{t(KIND[item.type])}</span>
                      </span>
                      <span className="inbox-preview"><EmojiText text={item.preview} /></span>
                    </span>
                  </button>
                  {href && (
                    <a
                      className="saved-link-chip"
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      dir="ltr"
                      aria-label={t('saved.openLink')}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {t('preview.link')}
                    </a>
                  )}
                  <button type="button" className="saved-drop" aria-label={t('saved.unsave')} onClick={() => remove(currentUser.id, item.messageId)}>
                    <IonIcon icon={bookmark} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {hasMore && <button type="button" disabled={loading} onClick={async () => {
          setLoading(true); setError('');
          try { await load(true); } catch { setError(t('saved.loadError')); }
          finally { setLoading(false); }
        }}>{t('saved.loadMore')}</button>}
      </IonContent>
    </IonPage>
  );
}
