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
import { useDataSaver } from '../hooks/useDataSaver';
import { AdminApiError, adminFetch } from '../lib/adminApi';
import { readDirectoryUsers } from '../lib/directory';
import { roleLabel } from '../lib/roles';
import { useChatStore } from '../stores/chatStore';
import { useUserStore } from '../stores/userStore';
import type { Message } from '../types/message';
import type { User } from '../types/user';

type OwnerGroup = { id: string; name: string };

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
  label,
  onOpen,
}: {
  id: string;
  title: string;
  detail: string;
  color: string;
  photo?: string;
  label: string;
  onOpen: (id: string) => void;
}) {
  return (
    <button type="button" className="owner-row" aria-label={label} onClick={() => onOpen(id)}>
      <Avatar name={title} color={color} src={photo} size={40} />
      <span className="owner-copy">
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
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
  const removeUser = useUserStore((state) => state.removeUser);
  const updateUser = useUserStore((state) => state.updateUser);
  const dataSaver = useDataSaver();
  const alive = useRef(true);
  const [access, setAccess] = useState<'pending' | 'ready' | 'denied'>('pending');
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<OwnerGroup[]>([]);
  const [target, setTarget] = useState<User>();
  const [group, setGroup] = useState<OwnerGroup>();
  const [done, setDone] = useState('');

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
            <p className="settings-lead">اختر ما تريد حذفه لكل حساب أو مجموعة. محادثة ChatX الرئيسية تبقى.</p>
            {done ? <p className="owner-done" role="status">{done}</p> : null}
            <h2>الأعضاء <span>{users.length}</span></h2>
            {users.length === 0 ? <EmptyState title="لا يوجد أعضاء آخرون" /> : users.map((user) => {
              const role = roleLabel(user.role);
              return (
                <OwnerRow
                  key={user.id}
                  id={user.id}
                  title={user.displayName}
                  detail={role ? `@${user.username} · ${role}` : `@${user.username}`}
                  color={user.color}
                  photo={dataSaver ? undefined : user.avatarUrl}
                  label={`حذف ${user.displayName}`}
                  onOpen={openUser}
                />
              );
            })}
            <h2>المجموعات <span>{groups.length}</span></h2>
            {groups.length === 0 ? <EmptyState title="لا توجد مجموعات" /> : groups.map((item) => (
              <OwnerRow
                key={item.id}
                id={item.id}
                title={item.name}
                detail="مجموعة"
                color={GROUP_COLOR}
                label={`حذف ${item.name}`}
                onOpen={openGroup}
              />
            ))}
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
