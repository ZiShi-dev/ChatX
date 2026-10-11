import type { CSSProperties } from 'react';
import { IonContent, IonHeader, IonPage } from '@ionic/react';
import { useParams } from 'react-router-dom';
import MediaTabs from '../components/chat/MediaLibrary';
import Avatar from '../components/common/Avatar';
import EmptyState from '../components/common/EmptyState';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import PageNav from '../components/common/PageNav';
import CustomRoleBadge from '../components/common/CustomRoleBadge';
import ProfileEffect from '../components/common/ProfileEffect';
import { useProfileMotion } from '../hooks/useProfileMotion';
import { otherParticipant } from '../lib/conversation';
import { connectionLabel, getUserPresence } from '../lib/presence';
import { displayNameStyleForUser, fontLabel } from '../lib/userStyle';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import RoomNotifyPanel from '../components/conversations/RoomNotifyPanel';
import { useUserStore } from '../stores/userStore';

export default function DirectMediaPage() {
  const { id = '' } = useParams();
  const animate = useProfileMotion();
  const currentUser = useAuthStore((state) => state.currentUser);
  const users = useUserStore((state) => state.users);
  const conversation = useChatStore((state) => state.conversations.find((item) => item.id === id));
  const other = conversation?.type === 'private' ? otherParticipant(conversation, currentUser.id, users) : undefined;
  const isSelf = conversation?.self === true;

  return (
    <IonPage>
      <IonHeader>
        <NetworkStatusBanner />
        <PageNav title="ملف المحادثة" fallback={id ? `/chat/${id}` : '/home'} />
      </IonHeader>
      <IonContent className="profile-page group-profile-scroll">
        {!conversation || conversation.type !== 'private' || (!other && !isSelf) ? (
          <EmptyState title="المحادثة غير موجودة" />
        ) : (
          <div className="profile-frame">
            <section className="profile-hero">
              {(() => {
                const subject = isSelf ? currentUser : other!;
                return (
                  <>
                    <ProfileEffect effect={subject.profileEffect} color={subject.color} />
                    <div
                      className={subject.bannerUrl ? 'profile-banner is-photo' : 'profile-banner'}
                      style={{ '--banner': subject.color } as CSSProperties}
                    >
                      {subject.bannerUrl ? <img src={subject.bannerUrl} alt="" /> : null}
                      <ProfileEffect effect={subject.profileEffect} color={subject.color} placement="banner" />
                    </div>
                    <span className="group-hero-photo">
                      <Avatar
                        name={subject.displayName}
                        color={subject.color}
                        size={96}
                        src={subject.avatarUrl}
                        decoration={subject.avatarDecoration}
                        animate={animate}
                      />
                    </span>
                    <h1 {...displayNameStyleForUser(subject.color, subject.messageFont)} dir="auto">{subject.displayName}</h1>
                    <p className="profile-handle" dir="auto">@{subject.username}</p>
                    <p className="profile-status">
                      <i className={getUserPresence(subject.id, users) === 'online' ? 'on' : ''} />
                      {connectionLabel(subject, { self: isSelf })}
                    </p>
                    <p className="member-chips">
                      <CustomRoleBadge user={subject} />
                      {isSelf && <span className="kind-pill">أنت</span>}
                    </p>
                  </>
                );
              })()}
            </section>
            {!isSelf && other && (
              <dl className="account-facts">
                <div>
                  <dt>خط الاسم</dt>
                  <dd>{fontLabel(other.messageFont)}</dd>
                </div>
                <div>
                  <dt>لون الاسم</dt>
                  <dd className="profile-style-swatch" style={{ '--style-color': other.color } as CSSProperties}>
                    <span aria-hidden="true" />
                  </dd>
                </div>
              </dl>
            )}
            <section className="profile-bio">
              <span>النبذة</span>
              {(isSelf ? currentUser.bio : other?.bio) ? (
                <p dir="auto">{isSelf ? currentUser.bio : other?.bio}</p>
              ) : (
                <p>لا توجد نبذة</p>
              )}
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
