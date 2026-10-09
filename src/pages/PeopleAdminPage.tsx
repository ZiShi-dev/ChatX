import { useEffect, useState } from 'react';
import { IonContent, IonHeader, IonIcon, IonPage } from '@ionic/react';
import { trashOutline } from 'ionicons/icons';
import { Navigate } from 'react-router-dom';
import EmptyState from '../components/common/EmptyState';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import PageNav from '../components/common/PageNav';
import PageSkeleton from '../components/common/PageSkeleton';
import UserListItem from '../components/users/UserListItem';
import { AdminApiError, adminFetch } from '../lib/adminApi';
import { readDirectoryUsers } from '../lib/directory';
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

const EMPTY: Record<ChoiceKey, boolean> = {
  messages: false,
  images: false,
  files: false,
  reactions: false,
  privateChats: false,
  profile: false,
  membership: false,
  account: false,
};

const EMPTY_GROUP: Record<GroupChoiceKey, boolean> = {
  messages: false,
  images: false,
  files: false,
  reactions: false,
  group: false,
};

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

export default function PeopleAdminPage() {
  const loadHome = useChatStore((state) => state.loadHome);
  const removeUser = useUserStore((state) => state.removeUser);
  const [access, setAccess] = useState<'pending' | 'ready' | 'denied'>('pending');
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<OwnerGroup[]>([]);
  const [target, setTarget] = useState<User>();
  const [group, setGroup] = useState<OwnerGroup>();
  const [choices, setChoices] = useState(EMPTY);
  const [groupChoices, setGroupChoices] = useState(EMPTY_GROUP);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void adminFetch('/api/owner/members').then((payload) => {
      if (!alive) return;
      const next = readDirectoryUsers(payload);
      if (!next) {
        setAccess('denied');
        return;
      }
      setUsers(next);
      setGroups(readGroups(payload));
      setAccess('ready');
    }).catch(() => {
      if (alive) setAccess('denied');
    });
    return () => {
      alive = false;
    };
  }, []);

  const selected = CHOICES.some((item) => choices[item.key]);
  const groupSelected = GROUP_CHOICES.some((item) => groupChoices[item.key]);
  const open = (user: User) => {
    setChoices(EMPTY);
    setNotice('');
    setGroup(undefined);
    setTarget(user);
  };
  const openGroup = (item: OwnerGroup) => {
    setGroupChoices(EMPTY_GROUP);
    setNotice('');
    setTarget(undefined);
    setGroup(item);
  };
  const close = () => {
    if (busy) return;
    setTarget(undefined);
    setGroup(undefined);
  };
  const toggle = (key: ChoiceKey) => {
    setChoices((current) => {
      const next = { ...current, [key]: !current[key] };
      if (key === 'account' && next.account) {
        for (const item of CHOICES) if (item.withAccount) next[item.key] = true;
      }
      return next;
    });
  };
  const erase = () => {
    if (!target || !selected || busy) return;
    const person = target;
    const picked = { ...choices };
    if (picked.account) {
      for (const item of CHOICES) if (item.withAccount) picked[item.key] = true;
    }
    setBusy(true);
    setNotice('');
    void adminFetch('/api/owner/erase', { method: 'POST', body: { userId: person.id, ...picked } }).then(async () => {
      useChatStore.setState((state) => ({
        messages: state.messages.flatMap((message) => {
          if (dropsMessage(message, person.id, picked)) return [];
          if (!picked.reactions || !message.reactions?.some((item) => item.userId === person.id)) return [message];
          const reactions = message.reactions.filter((item) => item.userId !== person.id);
          return [{ ...message, reactions }];
        }),
      }));
      if (picked.account) removeUser(person.id);
      await loadHome();
      const payload = await adminFetch('/api/owner/members');
      const next = readDirectoryUsers(payload);
      if (next) {
        setUsers(next);
        setGroups(readGroups(payload));
      }
      setTarget(undefined);
    }).catch((error: unknown) => {
      setNotice(failureText(error));
    }).finally(() => {
      setBusy(false);
    });
  };
  const toggleGroup = (key: GroupChoiceKey) => {
    setGroupChoices((current) => {
      const next = { ...current, [key]: !current[key] };
      if (key === 'group' && next.group) {
        for (const item of GROUP_CHOICES) if (item.withGroup) next[item.key] = true;
      }
      return next;
    });
  };
  const eraseGroup = () => {
    if (!group || !groupSelected || busy) return;
    const room = group;
    const picked = { ...groupChoices };
    if (picked.group) {
      for (const item of GROUP_CHOICES) if (item.withGroup) picked[item.key] = true;
    }
    setBusy(true);
    setNotice('');
    void adminFetch('/api/owner/groups/erase', { method: 'POST', body: { roomId: room.id, ...picked } }).then(async () => {
      useChatStore.setState((state) => ({
        conversations: picked.group ? state.conversations.filter((item) => item.id !== room.id) : state.conversations,
        messages: state.messages.flatMap((message) => {
          if (message.conversationId !== room.id) return [message];
          if (picked.group) return [];
          if (picked.images && message.type === 'image') return [];
          if (picked.files && message.type === 'file') return [];
          if (picked.messages && message.type !== 'image' && message.type !== 'file') return [];
          if (picked.reactions) return [{ ...message, reactions: [] }];
          return [message];
        }),
      }));
      await loadHome();
      const payload = await adminFetch('/api/owner/members');
      const next = readDirectoryUsers(payload);
      if (next) {
        setUsers(next);
        setGroups(readGroups(payload));
      }
      setGroup(undefined);
    }).catch((error: unknown) => {
      setNotice(failureText(error, true));
    }).finally(() => {
      setBusy(false);
    });
  };

  if (access === 'denied') return <Navigate to="/home" replace />;

  return (
    <IonPage>
      <IonHeader>
        <NetworkStatusBanner />
        <PageNav title="الإدارة" fallback="/account" />
      </IonHeader>
      <IonContent className="people-admin">
        {access === 'pending' ? <PageSkeleton kind="people" /> : null}
        {access === 'ready' ? (
          <>
            <p className="settings-lead">اختر ما تريد حذفه لكل حساب أو مجموعة. محادثة ChatX الرئيسية تبقى.</p>
            <h2>الأعضاء</h2>
            {users.length === 0 ? <EmptyState title="لا يوجد أعضاء آخرون" /> : users.map((user) => (
              <UserListItem key={user.id} user={user} onClick={() => undefined} onDelete={() => open(user)} />
            ))}
            <h2>المجموعات</h2>
            {groups.length === 0 ? <EmptyState title="لا توجد مجموعات" /> : groups.map((item) => (
              <div className="owner-group" key={item.id}>
                <strong dir="auto">{item.name}</strong>
                <button type="button" className="account-delete" aria-label="حذف المجموعة" onClick={() => openGroup(item)}>
                  <IonIcon icon={trashOutline} />
                </button>
              </div>
            ))}
          </>
        ) : null}
      </IonContent>
      {target ? (
        <div className="app-scrim sheet" onClick={close}>
          <div
            className="app-sheet admin-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="owner-erase-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="owner-erase-title" dir="auto">حذف {target.displayName}</h2>
            <div className="owner-choices">
              {CHOICES.map((item) => {
                const locked = Boolean(item.withAccount && choices.account);
                return (
                  <label key={item.key}>
                    <input
                      type="checkbox"
                      checked={locked || choices[item.key]}
                      disabled={locked || busy}
                      onChange={() => toggle(item.key)}
                    />
                    <span>{item.label}</span>
                  </label>
                );
              })}
            </div>
            {choices.account ? <p>حذف الحساب يزيل رسائله وصوره وملفاته وتفاعلاته.</p> : null}
            {notice ? <p className="form-error">{notice}</p> : null}
            <div className="account-actions">
              <button type="button" onClick={close} disabled={busy}>إلغاء</button>
              <button type="button" className="danger" onClick={erase} disabled={!selected || busy}>حذف</button>
            </div>
          </div>
        </div>
      ) : null}
      {group ? (
        <div className="app-scrim sheet" onClick={close}>
          <div
            className="app-sheet admin-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="owner-group-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="owner-group-title" dir="auto">حذف {group.name}</h2>
            <div className="owner-choices">
              {GROUP_CHOICES.map((item) => {
                const locked = Boolean(item.withGroup && groupChoices.group);
                return (
                  <label key={item.key}>
                    <input
                      type="checkbox"
                      checked={locked || groupChoices[item.key]}
                      disabled={locked || busy}
                      onChange={() => toggleGroup(item.key)}
                    />
                    <span>{item.label}</span>
                  </label>
                );
              })}
            </div>
            {groupChoices.group ? <p>حذف المجموعة يزيل رسائلها وصورها وملفاتها وأعضاءها.</p> : null}
            {notice ? <p className="form-error">{notice}</p> : null}
            <div className="account-actions">
              <button type="button" onClick={close} disabled={busy}>إلغاء</button>
              <button type="button" className="danger" onClick={eraseGroup} disabled={!groupSelected || busy}>حذف</button>
            </div>
          </div>
        </div>
      ) : null}
    </IonPage>
  );
}
