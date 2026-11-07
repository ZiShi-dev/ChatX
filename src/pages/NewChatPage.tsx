import { useMemo, useState } from 'react';
import {
  IonButton,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonLabel,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonToolbar,
} from '@ionic/react';
import { checkmark, closeOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import Avatar from '../components/common/Avatar';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import PageNav from '../components/common/PageNav';
import SearchBar from '../components/common/SearchBar';
import { statusLabel } from '../lib/conversation';
import { isServerId } from '../lib/home';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useUserStore } from '../stores/userStore';
import { useI18n } from '../lib/i18n';

export default function NewChatPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const currentUserId = useAuthStore((state) => state.currentUser.id);
  const users = useUserStore((state) => state.users);
  const openPrivate = useChatStore((state) => state.openPrivate);
  const createGroup = useChatStore((state) => state.createGroup);
  const [mode, setMode] = useState<'private' | 'group'>('private');
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const people = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ar');
    return users
      .filter((user) => user.id !== currentUserId)
      .filter((user) => !isServerId(currentUserId) || isServerId(user.id))
      .filter((user) => {
        if (!normalized) return true;
        return `${user.displayName} ${user.username}`.toLocaleLowerCase('ar').includes(normalized);
      });
  }, [currentUserId, query, users]);

  const picked = useMemo(
    () => selected.map((id) => users.find((user) => user.id === id)).filter((user) => user !== undefined),
    [selected, users],
  );

  const startPrivate = (userId: string) => {
    if (busy) return;
    setNotice('');
    setBusy(true);
    void openPrivate(userId).then((conversationId) => {
      setBusy(false);
      if (conversationId) navigate(`/chat/${conversationId}`, { replace: true });
      else setNotice(t('newChat.errOpen'));
    });
  };

  const submitGroup = () => {
    if (busy || !title.trim() || selected.length < 2) return;
    setNotice('');
    setBusy(true);
    void createGroup(title, selected).then((conversationId) => {
      setBusy(false);
      if (conversationId) navigate(`/chat/${conversationId}`, { replace: true });
      else setNotice(t('newChat.errCreate'));
    });
  };

  const toggle = (userId: string) => {
    setSelected((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));
  };

  return (
    <IonPage>
      <IonHeader>
        <NetworkStatusBanner />
        <PageNav title={t('newChat.title')} fallback="/home" />
        <IonToolbar className="page-toolbar sub">
          <IonSegment className="home-filters" value={mode} onIonChange={(event) => setMode((event.detail.value as 'private' | 'group') || 'private')}>
            <IonSegmentButton value="private">
              <IonLabel>{t('home.private')}</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="group">
              <IonLabel>{t('home.groups')}</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonToolbar>
      </IonHeader>
      <IonContent className="new-chat">
        {mode === 'group' && (
          <div className="new-group">
            <label className="group-name">
              <span>{t('newChat.groupName')}</span>
              <input
                dir="auto"
                value={title}
                maxLength={40}
                placeholder={t('newChat.groupPlaceholder')}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <p className="muted">{selected.length < 2 ? t('newChat.pickTwo') : t('newChat.selectedCount', { count: selected.length })}</p>
            {picked.length > 0 && (
              <div className="picked-row">
                {picked.map((user) => (
                  <button key={user.id} type="button" className="picked-chip" onClick={() => toggle(user.id)}>
                    <Avatar name={user.displayName} color={user.color} size={46} src={user.avatarUrl} decoration={user.avatarDecoration} />
                    <span>{user.displayName.split(' ')[0]}</span>
                    <IonIcon icon={closeOutline} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {notice && <p className="form-error new-empty">{notice}</p>}
        <SearchBar value={query} placeholder={t('newChat.searchPeople')} onChange={setQuery} />
        {people.length === 0 ? (
          <p className="muted new-empty">{t('newChat.noResults')}</p>
        ) : (
          <div className="person-list">
            {people.map((user) => {
              const on = selected.includes(user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  className={mode === 'group' && on ? 'person-row picked' : 'person-row'}
                  disabled={busy}
                  onClick={() => (mode === 'private' ? startPrivate(user.id) : toggle(user.id))}
                >
                  <Avatar name={user.displayName} color={user.color} src={user.avatarUrl} decoration={user.avatarDecoration} />
                  <span className="person-copy">
                    <strong>{user.displayName}</strong>
                    <em dir="auto">@{user.username}</em>
                  </span>
                  {mode === 'group' ? (
                    <span className={on ? 'person-check on' : 'person-check'} aria-hidden="true">
                      {on && <IonIcon icon={checkmark} />}
                    </span>
                  ) : (
                    <span className={`status-dot ${user.status}`}>{statusLabel(user.status)}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </IonContent>
      {mode === 'group' && (
        <IonFooter className="chat-footer">
          <IonButton expand="block" disabled={busy || !title.trim() || selected.length < 2} onClick={submitGroup}>
            {t('newChat.createGroup')}
          </IonButton>
        </IonFooter>
      )}
    </IonPage>
  );
}
