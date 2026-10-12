import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { IonContent, IonHeader, IonIcon, IonPage } from '@ionic/react';
import { trashOutline } from 'ionicons/icons';
import { Navigate } from 'react-router-dom';
import Avatar from '../components/common/Avatar';
import EmptyState from '../components/common/EmptyState';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import AccountTabs from '../components/account/AccountTabs';
import PageNav from '../components/common/PageNav';
import PageSkeleton from '../components/common/PageSkeleton';
import { AdminApiError, adminFetch } from '../lib/adminApi';
import { readDirectoryUsers } from '../lib/directory';
import { formatBytes } from '../lib/media';
import { formatPurgeCountdown, nextMediaPurgeAt } from '../lib/mediaRetention';
import { roleLabel } from '../lib/roles';
import { useChatStore } from '../stores/chatStore';
import { useUserStore } from '../stores/userStore';
import type { Message } from '../types/message';
import type { AvatarDecoration } from '../lib/profileCosmetics';
import type { User, UserStatus } from '../types/user';

type OwnerGroup = { id: string; name: string };

type OwnerSystemMedia = {
  mediaRetentionMs: number;
  diskImageFiles: number;
  diskFileFiles: number;
  diskBytes: number;
  metadataImages: number;
  metadataFiles: number;
  legacyImageRows: number;
  legacyFileRows: number;
  lastPurgeAt: string | null;
  lastPurgeError: string | null;
  lastExpiredImages: number;
  lastExpiredFiles: number;
  lastOrphans: number;
  nextPurgeAt?: string | null;
  purgeIntervalMs?: number;
};

type ChoiceKey = 'messages' | 'images' | 'files' | 'reactions' | 'privateChats' | 'profile' | 'membership' | 'account';
type GroupChoiceKey = 'messages' | 'images' | 'files' | 'reactions' | 'group';

const CHOICES: Array<{ key: ChoiceKey; label: string; withAccount?: boolean }> = [
  { key: 'messages', label: 'الرسائل', withAccount: true },
  { key: 'images', label: 'الصور', withAccount: true },
  { key: 'files', label: 'الملفات', withAccount: true },
  { key: 'reactions', label: 'التفاعلات', withAccount: true },
  { key: 'privateChats', label: 'المحادثات الخاصة' },
  { key: 'profile', label: 'صورة الحساب والغلاف', withAccount: true },
  { key: 'membership', label: 'العضوية في المجموعات', withAccount: true },
  { key: 'account', label: 'حذف الحساب' },
];

const GROUP_CHOICES: Array<{ key: GroupChoiceKey; label: string; withGroup?: boolean }> = [
  { key: 'messages', label: 'الرسائل', withGroup: true },
  { key: 'images', label: 'الصور', withGroup: true },
  { key: 'files', label: 'الملفات', withGroup: true },
  { key: 'reactions', label: 'التفاعلات', withGroup: true },
  { key: 'group', label: 'حذف المجموعة' },
];

const USER_OPTIONS = CHOICES.map((item) => ({ key: item.key, label: item.label, forced: item.withAccount }));
const GROUP_OPTIONS = GROUP_CHOICES.map((item) => ({ key: item.key, label: item.label, forced: item.withGroup }));
const GROUP_COLOR = '#3d9b84';

const GROUP_ID = /^[0-9a-f-]{36}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

function MediaPurgeClock({ system }: { system: OwnerSystemMedia }) {
  const hours = Math.max(1, Math.round(system.mediaRetentionMs / 3_600_000));
  const intervalMs = system.purgeIntervalMs && system.purgeIntervalMs > 0 ? system.purgeIntervalMs : DAY_MS;
  const intervalHours = Math.max(1, Math.round(intervalMs / 3_600_000));
  const nextAt = nextMediaPurgeAt(system.lastPurgeAt, system.nextPurgeAt ?? null, intervalMs);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (nextAt == null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [nextAt]);
  const remaining = nextAt == null ? null : Math.max(0, nextAt - now);
  return (
    <div className="owner-system-clock">
      <p className="owner-system-hint">
        تُحفظ الصور والملفات والفيديو على القرص <span dir="ltr">{hours}</span> ساعة من وقت حفظها. يحذفها الفحص التالي بعد هذه المدة. يعمل الفحص كل <span dir="ltr">{intervalHours}</span> ساعة في موعد ثابت، لذلك قد يبقى ملف حتى الفحص الذي يلي بلوغه المهلة. إعادة تشغيل الخادم لا تعيد هذا المؤقت.
      </p>
      {remaining == null ? (
        <p className="owner-system-hint">يبدأ المؤقت بعد أول فحص للخادم.</p>
      ) : (
        <>
          <p className="owner-system-clock-label">الوقت حتى الفحص التالي</p>
          <time className="owner-system-timer" dir="ltr" dateTime={new Date(nextAt!).toISOString()}>{formatPurgeCountdown(remaining)}</time>
          <p className="owner-system-clock-when" dir="ltr">{new Date(nextAt!).toLocaleString('ar')}</p>
        </>
      )}
    </div>
  );
}

function readGroups(payload: unknown): OwnerGroup[] {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { groups?: unknown }).groups)) return [];
  const groups: OwnerGroup[] = [];
  for (const item of (payload as { groups: unknown[] }).groups) {
    if (!item || typeof item !== 'object') return [];
    const data = item as { id?: unknown; name?: unknown };
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (typeof data.id !== 'string' || !GROUP_ID.test(data.id) || name.length < 1 || name.length > 40) return [];
    groups.push({ id: data.id, name });
  }
  return groups;
}

function dropsMessage(message: Message, userId: string, choices: Record<ChoiceKey, boolean>) {
  if (message.senderId !== userId) return false;
  if (choices.account) return true;
  if (choices.images && message.type === 'image') return true;
  if (choices.files && message.type === 'file') return true;
  return choices.messages && message.type !== 'image' && message.type !== 'file';
}

function failureText(error: unknown, group = false) {
  if (!(error instanceof AdminApiError)) return 'تعذر الحذف.';
  if (error.code === 'offline') return 'تعذر الاتصال.';
  if (error.code === 'not_found') return group ? 'المجموعة غير موجودة.' : 'الحساب غير موجود.';
  if (error.code === 'forbidden') return 'غير مسموح.';
  return 'تعذر الحذف.';
}

function memberChoices(picked: Record<string, boolean>): Record<ChoiceKey, boolean> {
  return {
    messages: Boolean(picked.messages),
    images: Boolean(picked.images),
    files: Boolean(picked.files),
    reactions: Boolean(picked.reactions),
    privateChats: Boolean(picked.privateChats),
    profile: Boolean(picked.profile),
    membership: Boolean(picked.membership),
    account: Boolean(picked.account),
  };
}

function groupChoicesOf(picked: Record<string, boolean>): Record<GroupChoiceKey, boolean> {
  return {
    messages: Boolean(picked.messages),
    images: Boolean(picked.images),
    files: Boolean(picked.files),
    reactions: Boolean(picked.reactions),
    group: Boolean(picked.group),
  };
}

function patchMemberMessages(userId: string, picked: Record<ChoiceKey, boolean>) {
  if (!picked.account && !picked.messages && !picked.images && !picked.files && !picked.reactions) return;
  const messages = useChatStore.getState().messages;
  let changed = false;
  const next = messages.flatMap((message) => {
    if (dropsMessage(message, userId, picked)) {
      changed = true;
      return [];
    }
    if (!picked.reactions || !message.reactions?.some((item) => item.userId === userId)) return [message];
    changed = true;
    return [{ ...message, reactions: message.reactions.filter((item) => item.userId !== userId) }];
  });
  if (changed) useChatStore.setState({ messages: next });
}

function markDiskMediaExpired() {
  const messages = useChatStore.getState().messages.map((message) => {
    if (message.status !== 'sent') return message;
    if (message.type !== 'image' && message.type !== 'file' && message.type !== 'video') return message;
    if (message.media?.state === 'cached') return message;
    return { ...message, mediaExpired: true, downloadFailed: false };
  });
  useChatStore.setState({ messages });
}

function patchGroupMessages(roomId: string, picked: Record<GroupChoiceKey, boolean>) {
  const state = useChatStore.getState();
  if (picked.group) {
    const conversations = state.conversations.filter((item) => item.id !== roomId);
    const messages = state.messages.filter((item) => item.conversationId !== roomId);
    if (conversations.length !== state.conversations.length || messages.length !== state.messages.length) {
      useChatStore.setState({ conversations, messages });
    }
    return;
  }
  if (!picked.messages && !picked.images && !picked.files && !picked.reactions) return;
  let changed = false;
  const messages = state.messages.flatMap((message) => {
    if (message.conversationId !== roomId) return [message];
    if (picked.images && message.type === 'image') {
      changed = true;
      return [];
    }
    if (picked.files && message.type === 'file') {
      changed = true;
      return [];
    }
    if (picked.messages && message.type !== 'image' && message.type !== 'file') {
      changed = true;
      return [];
    }
    if (picked.reactions && message.reactions?.length) {
      changed = true;
      return [{ ...message, reactions: [] }];
    }
    return [message];
  });
  if (changed) useChatStore.setState({ messages });
}

const OwnerRow = memo(function OwnerRow({
  id,
  title,
  detail,
  color,
  photo,
  decoration,
  status,
  badge,
  label,
  onOpen,
}: {
  id: string;
  title: string;
  detail: string;
  color: string;
  photo?: string;
  decoration?: AvatarDecoration;
  status?: UserStatus;
  badge?: string;
  label: string;
  onOpen: (id: string) => void;
}) {
  return (
    <button type="button" className="owner-row" aria-label={label} onClick={() => onOpen(id)}>
      <span className="owner-face">
        <Avatar name={title} color={color} src={photo} size={48} decoration={decoration} animate={false} />
        {status ? <i className={status === 'online' ? 'on' : ''} /> : null}
      </span>
      <span className="owner-copy">
        <strong dir="auto">{title}</strong>
        {detail ? <small dir="auto">{detail}</small> : null}
      </span>
      {badge ? <span className="owner-role">{badge}</span> : null}
      <IonIcon icon={trashOutline} aria-hidden="true" />
    </button>
  );
});

function ChoiceSheet({
  titleId,
  title,
  warning,
  options,
  lockKey,
  group,
  onClose,
  onApply,
}: {
  titleId: string;
  title: string;
  warning: string;
  options: Array<{ key: string; label: string; forced?: boolean }>;
  lockKey: string;
  group?: boolean;
  onClose: () => void;
  onApply: (picked: Record<string, boolean>) => Promise<void>;
}) {
  const [choices, setChoices] = useState<Record<string, boolean>>(() => Object.fromEntries(options.map((item) => [item.key, false])));
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const locked = Boolean(choices[lockKey]);
  const count = options.reduce((sum, item) => sum + ((item.forced && locked) || choices[item.key] ? 1 : 0), 0);

  useEffect(() => () => {
    alive.current = false;
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const toggle = (key: string) => {
    setChoices((current) => {
      const next = { ...current, [key]: !current[key] };
      if (key === lockKey && next[lockKey]) {
        for (const item of options) if (item.forced) next[item.key] = true;
      }
      return next;
    });
  };
  const apply = () => {
    if (!count || busy) return;
    const picked = { ...choices };
    if (picked[lockKey]) {
      for (const item of options) if (item.forced) picked[item.key] = true;
    }
    setBusy(true);
    setNotice('');
    void onApply(picked).then(() => {
      if (alive.current) onClose();
    }).catch((error: unknown) => {
      if (!alive.current) return;
      setNotice(failureText(error, group));
      setBusy(false);
    });
  };

  return (
    <div className="app-scrim sheet" onClick={() => { if (!busy) onClose(); }}>
      <div
        className="app-sheet admin-confirm owner-sheet"
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="app-handle" />
        <h2 id={titleId} dir="auto">{title}</h2>
        <div className="owner-choices">
          {options.map((item) => {
            const held = Boolean(item.forced && locked);
            return (
              <label key={item.key} className={item.key === lockKey ? 'is-final' : held ? 'is-locked' : undefined}>
                <input
                  type="checkbox"
                  checked={held || Boolean(choices[item.key])}
                  disabled={held || busy}
                  onChange={() => toggle(item.key)}
                />
                <span>{item.label}</span>
              </label>
            );
          })}
        </div>
        {locked ? <p className="owner-warn">{warning}</p> : null}
        {notice ? <p className="form-error">{notice}</p> : null}
        <div className="account-actions">
          <button type="button" onClick={onClose} disabled={busy}>إلغاء</button>
          <button type="button" className="danger" onClick={apply} disabled={!count || busy}>
            {busy ? 'جارٍ الحذف' : count ? `حذف (${count})` : 'حذف'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PeopleAdminPage() {
  const loadHome = useChatStore((state) => state.loadHome);
  const setMainOpen = useChatStore((state) => state.setMainOpen);
  const removeUser = useUserStore((state) => state.removeUser);
  const updateUser = useUserStore((state) => state.updateUser);
  const alive = useRef(true);
  const [access, setAccess] = useState<'pending' | 'ready' | 'denied'>('pending');
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<OwnerGroup[]>([]);
  const [target, setTarget] = useState<User>();
  const [group, setGroup] = useState<OwnerGroup>();
  const [done, setDone] = useState('');
  const [system, setSystem] = useState<OwnerSystemMedia | null>(null);
  const [systemError, setSystemError] = useState('');
  const [wipeAsk, setWipeAsk] = useState(false);
  const [wiping, setWiping] = useState(false);
  const systemRequest = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    void adminFetch('/api/owner/members').then((payload) => {
      if (!current) return;
      const next = readDirectoryUsers(payload);
      if (!next) {
        setAccess('denied');
        return;
      }
      setUsers(next);
      setGroups(readGroups(payload));
      setAccess('ready');
    }).catch(() => {
      if (current) setAccess('denied');
    });
    return () => {
      current = false;
    };
  }, []);

  const refreshSystem = useCallback(() => {
    const request = ++systemRequest.current;
    void adminFetch('/api/owner/system').then((payload) => {
      if (!alive.current || request !== systemRequest.current) return;
      const media = payload && typeof payload === 'object' && 'media' in payload ? (payload as { media: OwnerSystemMedia }).media : null;
      if (!media) {
        setSystem(null);
        setSystemError('تعذر قراءة حالة الخادم.');
        return;
      }
      setSystem(media);
      setSystemError('');
    }).catch((error) => {
      if (!alive.current || request !== systemRequest.current) return;
      setSystem(null);
      setSystemError(error instanceof AdminApiError ? 'تعذر قراءة حالة الخادم.' : 'تعذر الاتصال بالخادم.');
    });
  }, []);

  useEffect(() => {
    if (access !== 'ready') return;
    refreshSystem();
    const timer = window.setInterval(refreshSystem, 60_000);
    return () => window.clearInterval(timer);
  }, [access, refreshSystem]);

  const wipeDisk = useCallback(async () => {
    ++systemRequest.current;
    setWiping(true);
    setDone('');
    try {
      const payload = await adminFetch('/api/owner/media/wipe', { method: 'POST', body: {} });
      ++systemRequest.current;
      markDiskMediaExpired();
      if (!alive.current) return;
      setWipeAsk(false);
      const media = payload && typeof payload === 'object' && 'media' in payload ? (payload as { media: OwnerSystemMedia | null }).media : null;
      setDone('حُذفت وسائط الرسائل من القرص ومن قاعدة البيانات. الصور المحفوظة على أجهزة المستخدمين لا تُحذف.');
      if (media) { setSystem(media); setSystemError(''); }
      else refreshSystem();
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof AdminApiError && error.code === 'offline') setDone('تعذر الاتصال.');
      else setDone('تعذر حذف الملفات.');
    } finally {
      if (alive.current) setWiping(false);
    }
  }, [refreshSystem]);

  const usersRef = useRef(users);
  const groupsRef = useRef(groups);
  usersRef.current = users;
  groupsRef.current = groups;
  const closeUser = useCallback(() => setTarget(undefined), []);
  const closeGroup = useCallback(() => setGroup(undefined), []);
  const openUser = useCallback((id: string) => {
    const person = usersRef.current.find((item) => item.id === id);
    if (!person) return;
    setDone('');
    setGroup(undefined);
    setTarget(person);
  }, []);
  const openGroup = useCallback((id: string) => {
    const room = groupsRef.current.find((item) => item.id === id);
    if (!room) return;
    setDone('');
    setTarget(undefined);
    setGroup(room);
  }, []);
  const erase = useCallback(async (person: User, raw: Record<string, boolean>) => {
    const picked = memberChoices(raw);
    await adminFetch('/api/owner/erase', { method: 'POST', body: { userId: person.id, ...picked } });
    patchMemberMessages(person.id, picked);
    if (picked.account) removeUser(person.id);
    else if (picked.profile) updateUser(person.id, { avatarUrl: undefined, bannerUrl: undefined });
    if (alive.current) {
      setUsers((list) => (
        picked.account
          ? list.filter((item) => item.id !== person.id)
          : picked.profile
            ? list.map((item) => (item.id === person.id ? { ...item, avatarUrl: undefined, bannerUrl: undefined } : item))
            : list
      ));
      setDone('تم الحذف.');
    }
    if (picked.messages || picked.images || picked.files || picked.reactions || picked.privateChats || picked.membership || picked.account) {
      void loadHome();
    }
  }, [loadHome, removeUser, updateUser]);
  const eraseGroup = useCallback(async (room: OwnerGroup, raw: Record<string, boolean>) => {
    const picked = groupChoicesOf(raw);
    await adminFetch('/api/owner/groups/erase', { method: 'POST', body: { roomId: room.id, ...picked } });
    patchGroupMessages(room.id, picked);
    if (alive.current) {
      if (picked.group) setGroups((list) => list.filter((item) => item.id !== room.id));
      setDone('تم الحذف.');
    }
    if (picked.messages || picked.images || picked.files || picked.reactions || picked.group) void loadHome();
  }, [loadHome]);

  if (access === 'denied') return <Navigate to="/home" replace />;

  return (
    <IonPage>
      <IonHeader>
        <NetworkStatusBanner />
        <PageNav title="الإدارة" fallback="/account" />
      </IonHeader>
      <IonContent className="people-admin account-scroll">
        {access === 'pending' ? <PageSkeleton kind="settings" /> : null}
        {access === 'ready' ? (
          <>
            <section className="admin-stats" aria-label="ملخص">
              <p><strong>{users.length}</strong><span>الأعضاء</span></p>
              <p><strong>{groups.length}</strong><span>المجموعات</span></p>
              <p><strong dir="ltr">{system ? formatBytes(system.diskBytes) : '…'}</strong><span>الوسائط</span></p>
            </section>
            {done ? <p className="owner-done" role="status">{done}</p> : null}
            <h2>الأعضاء <span>{users.length}</span></h2>
            {users.length === 0 ? <EmptyState title="لا يوجد أعضاء آخرون" /> : (
              <div className="owner-list">
                {users.map((user) => (
                  <OwnerRow
                    key={user.id}
                    id={user.id}
                    title={user.displayName}
                    detail={`@${user.username}`}
                    color={user.color}
                    photo={user.avatarUrl}
                    decoration={user.avatarDecoration}
                    status={user.status}
                    badge={roleLabel(user.role) || 'عضو'}
                    label={`حذف ${user.displayName}`}
                    onOpen={openUser}
                  />
                ))}
              </div>
            )}
            <h2>المجموعات <span>{groups.length}</span></h2>
            {groups.length === 0 ? <EmptyState title="لا توجد مجموعات" /> : (
              <div className="owner-list">
                {groups.map((item) => (
                  <OwnerRow
                    key={item.id}
                    id={item.id}
                    title={item.name}
                    detail=""
                    color={GROUP_COLOR}
                    badge="مجموعة"
                    label={`حذف ${item.name}`}
                    onOpen={openGroup}
                  />
                ))}
              </div>
            )}
            <section className="owner-system" aria-labelledby="owner-main-title">
              <h2 id="owner-main-title">المجموعة الرئيسية</h2>
              <p className="owner-system-hint">إخفاؤها يبقيها لمن هم داخلها فقط. إظهارها يعيد كل الحسابات إلى المجموعة.</p>
              <div className="account-actions">
                <button type="button" onClick={() => void setMainOpen(false).then((ok) => setDone(ok ? 'أُخفيت عن غير الأعضاء.' : 'تعذر إخفاء المجموعة.'))}>إخفاء عن غير الأعضاء</button>
                <button type="button" className="is-allow" onClick={() => void setMainOpen(true).then((ok) => setDone(ok ? 'ظهرت لكل الحسابات.' : 'تعذر إظهار المجموعة.'))}>إظهار للجميع</button>
              </div>
            </section>
            <section className="owner-system" aria-labelledby="owner-system-title">
              <h2 id="owner-system-title">حذف الوسائط من القرص</h2>
              {systemError ? <p className="owner-system-alert" role="alert">{systemError}</p> : null}
              {system?.lastPurgeError ? <p className="owner-system-alert" role="alert">آخر تنظيف للوسائط فشل: {system.lastPurgeError}</p> : null}
              {system && (system.legacyImageRows > 0 || system.legacyFileRows > 0) ? (
                <p className="owner-system-alert" role="alert">ما زالت هناك وسائط قديمة داخل قاعدة البيانات. أعد تشغيل الخادم لإكمال النقل إلى القرص.</p>
              ) : null}
              {system ? <MediaPurgeClock system={system} /> : !systemError ? <p className="owner-system-hint">جارٍ قراءة حالة الوسائط…</p> : null}
              {system ? (
                <ul className="owner-system-list">
                  <li>على القرص الآن: <span dir="ltr">{system.diskImageFiles}</span> صورة · <span dir="ltr">{system.diskFileFiles}</span> ملف أو فيديو · {formatBytes(system.diskBytes)}</li>
                  <li>في قاعدة البيانات: <span dir="ltr">{system.metadataImages}</span> صورة · <span dir="ltr">{system.metadataFiles}</span> ملف أو فيديو</li>
                  <li>آخر فحص: {system.lastPurgeAt ? new Date(system.lastPurgeAt).toLocaleString('ar') : 'لم يُنفَّذ بعد'}</li>
                  {system.lastPurgeAt ? (
                    <li>آخر حذف: <span dir="ltr">{system.lastExpiredImages}</span> صورة · <span dir="ltr">{system.lastExpiredFiles}</span> ملف أو فيديو · <span dir="ltr">{system.lastOrphans}</span> ملف بلا سجل</li>
                  ) : null}
                </ul>
              ) : null}
              {wipeAsk ? (
                <div className="owner-system-confirm">
                  <p className="owner-system-alert" role="alert">يُحذف الآن كل الصور والملفات والفيديو من القرص. الرسائل تبقى، ومؤقت الحذف التلقائي لا يعود إلى البداية.</p>
                  <div className="owner-system-actions">
                    <button type="button" onClick={() => setWipeAsk(false)} disabled={wiping}>إلغاء</button>
                    <button type="button" className="danger" onClick={() => void wipeDisk()} disabled={wiping}>{wiping ? 'جارٍ الحذف' : 'حذف الآن'}</button>
                  </div>
                </div>
              ) : (
                <div className="owner-system-actions">
                  <button type="button" onClick={refreshSystem} disabled={wiping}>تحديث الحالة</button>
                  <button type="button" className="danger" onClick={() => { setDone(''); setWipeAsk(true); }} disabled={wiping}>حذف ملفات القرص</button>
                </div>
              )}
            </section>
          </>
        ) : null}
        <div className="account-end" aria-hidden="true" />
      </IonContent>
      {access === 'ready' ? <AccountTabs active="admin" owner /> : null}
      {target ? (
        <ChoiceSheet
          titleId="owner-erase-title"
          title={`حذف ${target.displayName}`}
          warning="حذف الحساب يزيل رسائله وصوره وملفاته وتفاعلاته."
          options={USER_OPTIONS}
          lockKey="account"
          onClose={closeUser}
          onApply={(picked) => erase(target, picked)}
        />
      ) : null}
      {group ? (
        <ChoiceSheet
          titleId="owner-group-title"
          title={`حذف ${group.name}`}
          warning="حذف المجموعة يزيل رسائلها وصورها وملفاتها وأعضاءها."
          options={GROUP_OPTIONS}
          lockKey="group"
          group
          onClose={closeGroup}
          onApply={(picked) => eraseGroup(group, picked)}
        />
      ) : null}
    </IonPage>
  );
}
