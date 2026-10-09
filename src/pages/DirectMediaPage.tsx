import type { CSSProperties } from 'react';
import { IonContent, IonHeader, IonPage } from '@ionic/react';
import { useParams } from 'react-router-dom';
import MediaTabs from '../components/chat/MediaLibrary';
import Avatar from '../components/common/Avatar';
import EmptyState from '../components/common/EmptyState';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import PageNav from '../components/common/PageNav';
import { otherParticipant } from '../lib/conversation';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { connectionLabel, getUserPresence } from '../lib/presence';
import RoomNotifyPanel from '../components/conversations/RoomNotifyPanel';
import { useUserStore } from '../stores/userStore';

export default function DirectMediaPage() {
  const { id = '' } = useParams();
  const currentUser = useAuthStore((state) => state.currentUser);
  const users = useUserStore((state) => state.users);
  const conversation = useChatStore((state) => state.conversations.find((item) => item.id === id));
  const other = conversation?.type === 'private' ? otherParticipant(conversation, currentUser.id, users) : undefined;

  return (
    <IonPage>
      <IonHeader>
        <NetworkStatusBanner />
        <PageNav title={other?.displayName ?? 'الوسائط'} fallback={id ? `/chat/${id}` : '/home'} />
      </IonHeader>
      <IonContent className="profile-page">
        {!conversation || conversation.type !== 'private' || !other ? (
          <EmptyState title="المحادثة غير موجودة" />
        ) : (
          <div className="profile-frame">
            <section className="profile-hero direct-media-hero">
              <div className={other.bannerUrl ? 'profile-banner is-photo' : 'profile-banner'} style={{ '--banner': other.color } as CSSProperties}>
                {other.bannerUrl ? <img src={other.bannerUrl} alt="" /> : null}
              </div>
              <span className="group-hero-photo">
                <Avatar name={other.displayName} color={other.color} size={96} src={other.avatarUrl} />
              </span>
              <h1>{other.displayName}</h1>
              <p className="profile-status">
                <i className={getUserPresence(other.id, users) === 'online' ? 'on' : ''} />
                {connectionLabel(other)}
              </p>
            </section>
            <MediaTabs
              conversationId={conversation.id}
              scope="المحادثة"
              label="وسائط المحادثة"
              notify={<RoomNotifyPanel conversationId={conversation.id} />}
            />
          </div>
        )}
      </IonContent>
    </IonPage>
  );
}
