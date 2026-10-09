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
import UserProfileModal from '../components/users/UserProfileModal';
import { membersOf } from '../lib/conversation';
import { connectionLabel } from '../lib/presence';
import { canEditRoom, canTakeGroupTurn, roleLabel } from '../lib/roles';
import { isServerId } from '../lib/home';
import { startPolling } from '../lib/poll';
import { serverNow } from '../lib/serverClock';
import { groupTurnStatus, type TurnRefresh } from '../lib/groupTurnStatus';
import { readBanner, readPhoto } from '../lib/photo';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { notifyLevel, ROOM_NOTIFY_LEVELS, useMuteStore } from '../stores/muteStore';
import { useUserStore } from '../stores/userStore';
import type { User } from '../types/user';

type GroupTab = 'members' | 'notify' | 'photos' | 'videos' | 'links';

function memberCountLabel(count: number) {
  if (count <= 1) return 'عضو واحد';
  if (count === 2) return 'عضوان';
  if (count <= 10) return `${count} أعضاء`;
  return `${count} عضو`;
}

export default function GroupProfilePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = useAuthStore((state) => state.currentUser);
  const users = useUserStore((state) => state.users);
  const conversation = useChatStore((state) => state.conversations.find((item) => item.id === id));
  const openPrivate = useChatStore((state) => state.openPrivate);
  const updateGroup = useChatStore((state) => state.updateGroup);
  const allMessages = useChatStore((state) => state.messages);
  const mutes = useMuteStore((state) => state.mutes);
  const setLevel = useMuteStore((state) => state.setLevel);
  const photoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<User>();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftBio, setDraftBio] = useState('');
  const [tab, setTab] = useState<GroupTab>('members');
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
    }, { active: () => location.pathname.replace(/\/$/, '') === `/group/${id}` });
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
    setSelected(undefined);
    void openPrivate(userId).then((conversationId) => {
      if (conversationId) navigate(`/chat/${conversationId}`);
    });
  };

  const isRoom = conversation?.type === 'group' || conversation?.type === 'global';
  const serverRoom = Boolean(conversation && isRoom && isServerId(conversation.id));
  const canEdit = conversation && serverRoom
    ? canTakeGroupTurn(currentUser.id, conversation, now)
    : Boolean(conversation && isRoom && canEditRoom(currentUser, conversation));
  const onlineCount = members.filter((user) => user.status === 'online').length;
  const groupName = conversation?.name ?? 'مجموعة';
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
        <PageNav title="ملف المجموعة" fallback={id ? `/chat/${id}` : '/home'} />
      </IonHeader>
      <IonContent className="profile-page group-profile-scroll">
        {!isRoom || !conversation ? (
          <EmptyState title="المجموعة غير موجودة" />
        ) : (
          <div className="profile-frame">
            <section className="profile-hero">
              <div className={conversation.bannerUrl ? 'profile-banner is-photo' : 'profile-banner'} style={{ '--banner': '#3d9b84' } as CSSProperties}>
                {conversation.bannerUrl ? <img src={conversation.bannerUrl} alt="" /> : null}
                {canEdit && (
                  <button type="button" className="banner-pick" aria-label="تغيير الغلاف" onClick={() => bannerRef.current?.click()}>
                    <IonIcon icon={cameraOutline} />
                    <span>الغلاف</span>
                  </button>
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
                <button type="button" className="photo-pick profile-photo" aria-label="تغيير صورة المجموعة" onClick={() => photoRef.current?.click()}>
                  <Avatar name={groupName} color="#3d9b84" size={96} src={conversation.avatarUrl} />
                  <span className="photo-badge">
                    <IonIcon icon={cameraOutline} />
                  </span>
                </button>
              ) : (
                <span className="group-hero-photo">
                  <Avatar name={groupName} color="#3d9b84" size={96} src={conversation.avatarUrl} />
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
                <p className="group-turn">{groupTurnStatus(turnHolder?.displayName ?? 'عضو', conversation.turnUserId === currentUser.id, now, conversation.turnOpensAt, turnRefresh)}</p>
              )}
              {showTurn && conversation?.turnOpensAt && now >= Date.parse(conversation.turnOpensAt) + 7 * 24 * 60 * 60 * 1000 && turnRefresh !== 'loading' && (
                <button type="button" className="group-edit" onClick={() => void refreshTurn()}>إعادة المحاولة</button>
              )}
              {conversation.bio ? (
                <p className="group-bio">{conversation.bio}</p>
              ) : (
                canEdit && (
                  <button type="button" className="group-bio-add" onClick={openEditor}>
                    أضف وصفاً
                  </button>
                )
              )}
              {canEdit && (
                <button type="button" className="group-edit" onClick={openEditor}>
                  <IonIcon icon={pencilOutline} />
                  <span>تعديل</span>
                </button>
              )}
              <p className="profile-status">
                <i className={onlineCount > 0 ? 'on' : ''} />
                {memberCountLabel(members.length)}
                {onlineCount > 0 ? ` · ${onlineCount} متصل` : ''}
              </p>
            </section>
            <div className="group-tabs" role="tablist" aria-label="ملف المجموعة">
              {(
                [
                  { id: 'members', label: 'الأعضاء' },
                  { id: 'notify', label: 'الإشعارات' },
                  { id: 'photos', label: 'الصور', count: media.photos.length },
                  { id: 'videos', label: 'الفيديو', count: media.videos.length },
                  { id: 'links', label: 'الروابط', count: media.links.length },
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
                  <span>{item.label}</span>
                  {'count' in item && item.count > 0 && <em>{item.count}</em>}
                </button>
              ))}
            </div>
            {tab === 'notify' && (
              <section className="group-block" role="tabpanel">
                <p className="group-block-note">اختر ما يصلك من هذه المجموعة.</p>
                <div className="group-notify" role="radiogroup" aria-label="إشعارات المجموعة">
                  {ROOM_NOTIFY_LEVELS.map((item) => {
                    const on = notifyLevel(mutes, conversation.id) === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        className={on ? 'is-on' : undefined}
                        onClick={() => setLevel(conversation.id, item.id)}
                      >
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.hint}</small>
                        </span>
                        <i />
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
            {(tab === 'photos' || tab === 'videos' || tab === 'links') && (
              <section className="group-block" role="tabpanel">
                <MediaPanel conversationId={conversation.id} kind={tab} scope="المجموعة" />
              </section>
            )}
            {tab === 'members' && (
              <section className="member-section" role="tabpanel">
                {members.map((user) => (
                  <button key={user.id} type="button" className="group-profile-card" onClick={() => setSelected(user)}>
                    <Avatar name={user.displayName} color={user.color} size={48} src={user.avatarUrl} />
                    <span className="group-profile-copy">
                      <strong>
                        {user.displayName}
                        {user.id === currentUser.id && <span className="role-badge">أنت</span>}
                        {roleLabel(user.role) && <span className="role-badge">{roleLabel(user.role)}</span>}
                        {user.role === 'member' && user.id === conversation.adminId && <span className="role-badge">مشرف</span>}
                      </strong>
                      <small dir="auto">@{user.username}</small>
                      {user.bio ? <p>{user.bio}</p> : null}
                    </span>
                    <span className={`status-dot ${user.status}`}>{connectionLabel(user, { self: user.id === currentUser.id })}</span>
                  </button>
                ))}
              </section>
            )}
          </div>
        )}
      </IonContent>
      <UserProfileModal
        user={selected}
        isSelf={selected?.id === currentUser.id}
        onClose={() => setSelected(undefined)}
        onMessage={messageUser}
      />
      {editing &&
        createPortal(
          <div className="app-scrim sheet" onClick={() => setEditing(false)}>
            <div className="app-sheet profile-pop" role="dialog" aria-labelledby="group-edit-title" onClick={(event) => event.stopPropagation()}>
              <span className="app-handle" />
              <h2 id="group-edit-title">تعديل المجموعة</h2>
              <button type="button" className="photo-pick profile-photo sheet-photo" aria-label="تغيير صورة المجموعة" onClick={() => photoRef.current?.click()}>
                <Avatar name={draftName || groupName} color="#3d9b84" size={96} src={conversation?.avatarUrl} />
                <span className="photo-badge">
                  <IonIcon icon={cameraOutline} />
                </span>
              </button>
              <p className="sheet-photo-hint">تغيير الصورة</p>
              <label className="group-name">
                <span>اسم المجموعة</span>
                <input dir="auto" value={draftName} onChange={(event) => setDraftName(event.target.value)} />
              </label>
              <label className="group-name">
                <span>الوصف</span>
                <textarea dir="auto" maxLength={160} rows={3} value={draftBio} onChange={(event) => setDraftBio(event.target.value)} />
              </label>
              <div className="account-actions">
                <button type="button" onClick={() => setEditing(false)}>إلغاء</button>
                <button type="button" className="profile-save" onClick={saveProfile}>حفظ</button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </IonPage>
  );
}
