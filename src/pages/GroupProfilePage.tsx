import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { IonContent, IonHeader, IonIcon, IonPage } from '@ionic/react';
import { cameraOutline, pencilOutline } from 'ionicons/icons';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { collectMedia, MediaPanel } from '../components/chat/MediaLibrary';
import Avatar from '../components/common/Avatar';
import EmptyState from '../components/common/EmptyState';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import PageNav from '../components/common/PageNav';
import { membersOf } from '../lib/conversation';
import { connectionLabel } from '../lib/presence';
import { canEditRoom, canTakeGroupTurn, hasAdminAccess, roleLabel } from '../lib/roles';
import { adminFetch } from '../lib/adminApi';
import { isServerId } from '../lib/home';
import { startPolling } from '../lib/poll';
import { serverNow } from '../lib/serverClock';
import { groupTurnStatus, type TurnRefresh } from '../lib/groupTurnStatus';
import { readBanner, readPhoto } from '../lib/photo';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import RoomNotifyPanel from '../components/conversations/RoomNotifyPanel';
import { useUserStore } from '../stores/userStore';
import type { User } from '../types/user';
import { useI18n, type MessageKey } from '../lib/i18n';

type GroupTab = 'members' | 'notify' | 'photos' | 'videos' | 'links';

export default function GroupProfilePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, locale } = useI18n();
  const currentUser = useAuthStore((state) => state.currentUser);
  const accent = useSettingsStore((state) => state.appearance.accent);
  const users = useUserStore((state) => state.users);
  const conversation = useChatStore((state) => state.conversations.find((item) => item.id === id));
  const openPrivate = useChatStore((state) => state.openPrivate);
  const updateGroup = useChatStore((state) => state.updateGroup);
  const setRoomMember = useChatStore((state) => state.setRoomMember);
  const setMainOpen = useChatStore((state) => state.setMainOpen);
  const deleteGroup = useChatStore((state) => state.deleteGroup);
  const listOutsiders = useChatStore((state) => state.listOutsiders);
  const allMessages = useChatStore((state) => state.messages);
  const photoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftBio, setDraftBio] = useState('');
  const [tab, setTab] = useState<GroupTab>('members');
  const [adding, setAdding] = useState(false);
  const [outsiders, setOutsiders] = useState<User[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [manageNote, setManageNote] = useState('');
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    if (!isServerId(currentUser.id)) return;
    let alive = true;
    void adminFetch('/api/owner/members').then(() => {
      if (alive) setOwner(true);
    }).catch(() => {
      if (alive) setOwner(false);
    });
    return () => { alive = false; };
  }, [currentUser.id]);
  const [now, setNow] = useState(serverNow);
  const [turnRefresh, setTurnRefresh] = useState<TurnRefresh>('loading');
  const pendingTurn = useRef<ReturnType<ReturnType<typeof useChatStore.getState>['loadGroupTurn']> | undefined>(undefined);
  const loadTurn = () => {
    if (!pendingTurn.current) pendingTurn.current = useChatStore.getState().loadGroupTurn(id).finally(() => { pendingTurn.current = undefined; });
    return pendingTurn.current;
  };
  const refreshTurn = async () => {
    setTurnRefresh('loading');
    const result = await loadTurn();
    setNow(serverNow());
    setTurnRefresh(result);
  };
  useEffect(() => {
    if (!isServerId(id)) return;
    let alive = true;
    const stop = startPolling(async () => {
      setTurnRefresh('loading');
      const result = await loadTurn();
      if (alive) { setNow(serverNow()); setTurnRefresh(result); }
    }, { active: () => location.pathname.replace(/\/$/, '') === `/group/${id}`, economy: true });
    return () => { alive = false; stop(); };
  }, [id, location.pathname]);
  useEffect(() => {
    const starts = Date.parse(conversation?.turnOpensAt ?? '');
    const expires = starts + 7 * 24 * 60 * 60 * 1000;
    if (!Number.isFinite(expires)) return;
    const timer = window.setTimeout(() => { setNow(serverNow()); void refreshTurn(); }, Math.max(0, Math.min(2_147_483_647, expires - serverNow())));
    return () => window.clearTimeout(timer);
  }, [conversation?.turnOpensAt]);

  const members = useMemo(() => {
    if (!conversation || (conversation.type !== 'group' && conversation.type !== 'global')) return [];
    return membersOf(conversation, users);
  }, [conversation, users]);

  const media = useMemo(
    () => (conversation ? collectMedia(allMessages, conversation.id) : { photos: [], videos: [], links: [] }),
    [allMessages, conversation],
  );

  const messageUser = (userId: string) => {
    void openPrivate(userId).then((conversationId) => {
      if (conversationId) navigate(`/chat/${conversationId}`);
    });
  };

  const isRoom = conversation?.type === 'group' || conversation?.type === 'global';
  const canManageMembers = Boolean(conversation && isRoom && (owner || hasAdminAccess(currentUser.role)));
  const canDeleteGroup = Boolean(conversation?.type === 'group' && (canManageMembers || conversation.adminId === currentUser.id));
  const serverRoom = Boolean(conversation && isRoom && isServerId(conversation.id));
  const canEdit = conversation && serverRoom
    ? canTakeGroupTurn(currentUser.id, conversation, now)
    : Boolean(conversation && isRoom && canEditRoom(currentUser, conversation));
  const onlineCount = members.filter((user) => user.status === 'online').length;
  const groupName = conversation?.name ?? t('group.defaultName');
  const memberCountLabel =
    members.length <= 1 ? t('members.one') : members.length === 2 ? t('members.two') : t('members.many', { count: members.length });
  const turnHolder = members.find((user) => user.id === conversation?.turnUserId);
  const showTurn = Boolean(serverRoom && conversation && conversation.participantIds.length > 1 && conversation.turnUserId);

  const changePhoto = async (file?: File) => {
    if (!file || !conversation) return;
    const avatarUrl = await readPhoto(file).catch(() => '');
    if (avatarUrl) updateGroup(conversation.id, { avatarUrl });
  };

  const changeBanner = async (file?: File) => {
    if (!file || !conversation) return;
    const bannerUrl = await readBanner(file).catch(() => '');
    if (bannerUrl) updateGroup(conversation.id, { bannerUrl });
  };

  const openEditor = () => {
    setDraftName(groupName);
    setDraftBio(conversation?.bio ?? '');
    setEditing(true);
  };

  const saveProfile = async () => {
    if (!conversation || !draftName.trim()) return;
    const saved = await updateGroup(conversation.id, { name: draftName, bio: draftBio });
    if (saved) setEditing(false);
  };

  return (
    <IonPage>
      <IonHeader>
        <NetworkStatusBanner />
        <PageNav title={t('group.profileTitle')} fallback={id ? `/chat/${id}` : '/home'} />
      </IonHeader>
      <IonContent className="profile-page group-profile-scroll">
        {!isRoom || !conversation ? (
          <EmptyState title={t('group.notFound')} />
        ) : (
          <div className="profile-frame">
            <section className="profile-hero">
              <div className={conversation.bannerUrl ? 'profile-banner is-photo' : 'profile-banner'} style={{ '--banner': accent } as CSSProperties}>
                {conversation.bannerUrl ? <img src={conversation.bannerUrl} alt="" /> : null}
                {canEdit && (
                  <div className="banner-actions">
                    <button type="button" className="banner-pick" aria-label={t('group.changeBanner')} onClick={() => bannerRef.current?.click()}>
                      <IonIcon icon={cameraOutline} />
                      <span>{t('group.banner')}</span>
                    </button>
                    {conversation.bannerUrl && (
                      <button type="button" className="banner-pick" aria-label={t('group.removeBanner')} onClick={() => void updateGroup(conversation.id, { bannerUrl: null })}>
                        {t('group.remove')}
                      </button>
                    )}
                  </div>
                )}
                <input
                  ref={bannerRef}
                  className="photo-file"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    void changeBanner(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </div>
              {canEdit ? (
                <button type="button" className="photo-pick profile-photo" aria-label={t('group.changeGroupPhoto')} onClick={() => photoRef.current?.click()}>
                  <Avatar name={groupName} color={accent} size={96} src={conversation.avatarUrl} />
                  <span className="photo-badge">
                    <IonIcon icon={cameraOutline} />
                  </span>
                </button>
              ) : (
                <span className="group-hero-photo">
                  <Avatar name={groupName} color={accent} size={96} src={conversation.avatarUrl} />
                </span>
              )}
              <input
                ref={photoRef}
                className="photo-file"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  void changePhoto(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              <h1>{groupName}</h1>
              {showTurn && conversation && (
                <p className="group-turn">{groupTurnStatus(locale, turnHolder?.displayName ?? t('chat.unknownMember'), conversation.turnUserId === currentUser.id, now, conversation.turnOpensAt, turnRefresh)}</p>
              )}
              {showTurn && conversation?.turnOpensAt && now >= Date.parse(conversation.turnOpensAt) + 7 * 24 * 60 * 60 * 1000 && turnRefresh !== 'loading' && (
                <button type="button" className="group-edit" onClick={() => void refreshTurn()}>{t('group.retryTurn')}</button>
              )}
              {conversation.bio ? (
                <p className="group-bio">{conversation.bio}</p>
              ) : (
                canEdit && (
                  <button type="button" className="group-bio-add" onClick={openEditor}>
                    {t('group.addDescription')}
                  </button>
                )
              )}
              {canEdit && (
                <button type="button" className="group-edit" onClick={openEditor}>
                  <IonIcon icon={pencilOutline} />
                  <span>{t('group.edit')}</span>
                </button>
              )}
              <p className="profile-status">
                <i className={onlineCount > 0 ? 'on' : ''} />
                {memberCountLabel}
                {onlineCount > 0 ? t('group.onlineCount', { count: onlineCount }) : ''}
              </p>
            </section>
            <div className="group-tabs is-scroll" role="tablist" aria-label={t('group.tabsAria')}>
              {(
                [
                  { id: 'members', labelKey: 'group.tabMembers' as MessageKey },
                  { id: 'notify', labelKey: 'group.tabNotify' as MessageKey },
                  { id: 'photos', labelKey: 'group.tabPhotos' as MessageKey, count: media.photos.length },
                  { id: 'videos', labelKey: 'group.tabVideos' as MessageKey, count: media.videos.length },
                  { id: 'links', labelKey: 'group.tabLinks' as MessageKey, count: media.links.length },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  className={tab === item.id ? 'is-on' : undefined}
                  onClick={() => setTab(item.id)}
                >
                  <span>{t(item.labelKey)}</span>
                  {'count' in item && item.count > 0 && <em>{item.count}</em>}
                </button>
              ))}
            </div>
            {tab === 'notify' && (
              <section className="group-block" role="tabpanel">
                <RoomNotifyPanel conversationId={conversation.id} room />
              </section>
            )}
            {(tab === 'photos' || tab === 'videos' || tab === 'links') && (
              <section className="group-block" role="tabpanel">
                <MediaPanel conversationId={conversation.id} kind={tab} scope="group" />
              </section>
            )}
            {tab === 'members' && (
              <section className="member-section" role="tabpanel">
                {canManageMembers && (
                  <div className="group-manage">
                    {manageNote ? <p className="owner-done" role="status">{manageNote}</p> : null}
                    <button type="button" className="group-edit" onClick={() => {
                      setManageNote('');
                      void listOutsiders(conversation.id).then((people) => {
                        setOutsiders(people);
                        setAdding(true);
                      });
                    }}>{t('group.addMember')}</button>
                    {conversation.type === 'global' && (
                      <button type="button" className="group-edit" onClick={() => {
                        const open = conversation.closed === true;
                        void setMainOpen(open).then((ok) => setManageNote(ok ? (open ? t('group.noteVisibleAll') : t('group.noteHiddenNonMembers')) : t('group.noteVisibilityFailed')));
                      }}>{conversation.closed ? t('group.showToAll') : t('group.hideFromNonMembers')}</button>
                    )}
                  </div>
                )}
                {members.map((user) => {
                  const self = user.id === currentUser.id;
                  const presence = self ? currentUser : user;
                  return (
                    <div key={user.id} className="group-profile-card">
                      <button
                        type="button"
                        className="group-profile-open"
                        aria-label={self ? t('group.yourMessages') : t('group.chatWith', { name: user.displayName })}
                        onClick={() => messageUser(user.id)}
                      >
                        <Avatar name={user.displayName} color={user.color} size={48} src={user.avatarUrl} decoration={user.avatarDecoration} />
                        <span className="group-profile-copy">
                          <strong>
                            <span className="group-profile-name" dir="auto">{user.displayName}</span>
                            {self && <span className="role-badge">{t('member.you')}</span>}
                            {roleLabel(user.role) && <span className="role-badge">{roleLabel(user.role)}</span>}
                            {user.role === 'member' && user.id === conversation.adminId && <span className="role-badge">{t('group.badgeMod')}</span>}
                          </strong>
                          <span className="group-profile-meta">
                            <small dir="auto">@{user.username}</small>
                            <span className={`status-dot ${presence.status}`}>{connectionLabel(presence, { self })}</span>
                          </span>
                          {user.bio ? <p>{user.bio}</p> : null}
                        </span>
                      </button>
                      {canManageMembers && !self && (
                        <button
                          type="button"
                          className="member-remove"
                          aria-label={t('group.removeMemberAria', { name: user.displayName })}
                          onClick={() => {
                            void setRoomMember(conversation.id, user.id, false).then((ok) => setManageNote(ok ? t('group.removedOk') : t('group.removeFailed')));
                          }}
                        >{t('group.remove')}</button>
                      )}
                    </div>
                  );
                })}
                {canDeleteGroup && (
                  <div className="group-manage">
                    <button type="button" className="group-edit is-danger" onClick={() => setConfirmDelete(true)}>{t('group.deleteGroup')}</button>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </IonContent>
      {editing &&
        createPortal(
          <div className="app-scrim sheet" onClick={() => setEditing(false)}>
            <div className="app-sheet profile-pop" role="dialog" aria-labelledby="group-edit-title" onClick={(event) => event.stopPropagation()}>
              <span className="app-handle" />
              <h2 id="group-edit-title">{t('group.editTitle')}</h2>
              <button type="button" className="photo-pick profile-photo sheet-photo" aria-label={t('group.changeGroupPhoto')} onClick={() => photoRef.current?.click()}>
                <Avatar name={draftName || groupName} color={accent} size={96} src={conversation?.avatarUrl} />
                <span className="photo-badge">
                  <IonIcon icon={cameraOutline} />
                </span>
              </button>
              <p className="sheet-photo-hint">{t('group.photoHint')}</p>
              <label className="group-name">
                <span>{t('group.nameLabel')}</span>
                <input dir="auto" value={draftName} onChange={(event) => setDraftName(event.target.value)} />
              </label>
              <label className="group-name">
                <span>{t('group.descriptionLabel')}</span>
                <textarea dir="auto" maxLength={160} rows={3} value={draftBio} onChange={(event) => setDraftBio(event.target.value)} />
              </label>
              <div className="account-actions">
                <button type="button" onClick={() => setEditing(false)}>{t('profile.cancel')}</button>
                <button type="button" className="profile-save" onClick={saveProfile}>{t('profile.save')}</button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      {adding &&
        createPortal(
          <div className="app-scrim sheet" onClick={() => setAdding(false)}>
            <div className="app-sheet profile-pop" role="dialog" aria-labelledby="group-add-title" onClick={(event) => event.stopPropagation()}>
              <span className="app-handle" />
              <h2 id="group-add-title">{t('group.addMemberTitle')}</h2>
              {outsiders.length === 0 ? <p className="owner-system-hint">{t('group.noOutsiders')}</p> : outsiders.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className="group-profile-card group-add-person"
                  onClick={() => {
                    void setRoomMember(id, user.id, true).then((ok) => {
                      setManageNote(ok ? t('group.addedOk') : t('group.addFailed'));
                      if (ok) setOutsiders((list) => list.filter((item) => item.id !== user.id));
                    });
                  }}
                >
                  <Avatar name={user.displayName} color={user.color} size={48} src={user.avatarUrl} decoration={user.avatarDecoration} />
                  <span className="group-profile-copy">
                    <strong dir="auto">{user.displayName}</strong>
                    <small dir="auto">@{user.username}</small>
                  </span>
                </button>
              ))}
              <div className="account-actions">
                <button type="button" onClick={() => setAdding(false)}>{t('member.close')}</button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      {confirmDelete &&
        createPortal(
          <div className="app-scrim sheet" onClick={() => setConfirmDelete(false)}>
            <div className="app-sheet profile-pop" role="dialog" aria-labelledby="group-delete-title" onClick={(event) => event.stopPropagation()}>
              <span className="app-handle" />
              <h2 id="group-delete-title">{t('group.deleteTitle')}</h2>
              <p className="owner-system-hint">{t('group.deleteBody')}</p>
              <div className="account-actions">
                <button type="button" onClick={() => setConfirmDelete(false)}>{t('profile.cancel')}</button>
                <button type="button" className="danger" onClick={() => {
                  void deleteGroup(id).then((ok) => {
                    if (ok) navigate('/home', { replace: true });
                    else setManageNote(t('group.deleteFailed'));
                    setConfirmDelete(false);
                  });
                }}>{t('group.delete')}</button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </IonPage>
  );
}
