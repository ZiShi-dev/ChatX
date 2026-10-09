import { useEffect, useMemo, useState } from 'react';
import { IonContent, IonHeader, IonPage } from '@ionic/react';
import { useNavigate, useParams } from 'react-router-dom';
import EmptyState from '../components/common/EmptyState';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import PageNav from '../components/common/PageNav';
import PageSkeleton from '../components/common/PageSkeleton';
import SearchBar from '../components/common/SearchBar';
import MemberList from '../components/groups/MemberList';
import UserProfileModal from '../components/users/UserProfileModal';
import { membersOf } from '../lib/conversation';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useUserStore } from '../stores/userStore';
import type { User } from '../types/user';

export default function GroupMembersPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const users = useUserStore((state) => state.users);
  const conversation = useChatStore((state) => state.conversations.find((item) => item.id === id));
  const openPrivate = useChatStore((state) => state.openPrivate);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<User>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 180);
    return () => window.clearTimeout(timer);
  }, [id]);

  const members = useMemo(() => {
    if (!conversation) return [];
    const normalized = query.trim().toLocaleLowerCase('ar');
    return membersOf(conversation, users).filter((user) => {
      if (!normalized) return true;
      return `${user.displayName} ${user.username}`.toLocaleLowerCase('ar').includes(normalized);
    });
  }, [conversation, query, users]);

  const messageUser = (userId: string) => {
    setSelected(undefined);
    void openPrivate(userId).then((conversationId) => {
      if (conversationId) navigate(`/chat/${conversationId}`);
    });
  };

  return (
    <IonPage>
      <IonHeader>
        <NetworkStatusBanner />
        <PageNav title={conversation?.name ?? 'الأعضاء'} fallback={id ? `/chat/${id}` : '/home'} />
      </IonHeader>
      <IonContent>
        {!conversation ? (
          <EmptyState title="المجموعة غير موجودة" />
        ) : (
          <>
            <SearchBar value={query} placeholder="ابحث في الأعضاء" onChange={setQuery} />
            {!ready ? (
              <PageSkeleton kind="members" />
            ) : (
              <>
                <MemberList title="متصل" adminId={conversation.adminId} users={members.filter((user) => user.status === 'online')} onSelect={setSelected} />
                <MemberList title="غير متصل" adminId={conversation.adminId} users={members.filter((user) => user.status === 'offline')} onSelect={setSelected} />
                {members.length === 0 && <EmptyState title={query.trim() ? 'لا يوجد أعضاء مطابقون' : 'لا يوجد أعضاء'} />}
              </>
            )}
          </>
        )}
      </IonContent>
      <UserProfileModal
        user={selected}
        isSelf={selected?.id === currentUser.id}
        room={conversation && conversation.type !== 'private' ? { name: conversation.name ?? 'مجموعة', adminId: conversation.adminId } : undefined}
        onClose={() => setSelected(undefined)}
        onMessage={messageUser}
      />
    </IonPage>
  );
}
