import type { CSSProperties } from 'react';
import { IonContent, IonHeader, IonPage } from '@ionic/react';
import { useParams } from 'react-router-dom';
import MediaTabs from '../components/chat/MediaLibrary';
import Avatar from '../components/common/Avatar';
import EmptyState from '../components/common/EmptyState';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import PageNav from '../components/common/PageNav';
import CustomRoleBadge from '../components/common/CustomRoleBadge';
import { useProfileMotion } from '../hooks/useProfileMotion';
import { otherParticipant } from '../lib/conversation';
import { connectionLabel, getUserPresence } from '../lib/presence';
import { customRoleReady } from '../lib/customRole';
import { displayNameStyleForUser, fontLabel } from '../lib/userStyle';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import RoomNotifyPanel from '../components/conversations/RoomNotifyPanel';
import { useUserStore } from '../stores/userStore';
import { useI18n } from '../lib/i18n';

export default function DirectMediaPage() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const animate = useProfileMotion();
  const currentUser = useAuthStore((state) => state.currentUser);
  const users = useUserStore((state) => state.users);
  const conversation = useChatStore((state) => state.conversations.find((item) => item.id === id));
  const other = conversation?.type === 'private' ? otherParticipant(conversation, currentUser.id, users) : undefined;
  const isSelf = conversation?.self === true;
  const profileTitle = isSelf ? currentUser.displayName : other?.displayName ?? t('directMedia.fallbackTitle');

  return (
    <IonPage>
      <IonHeader>
        <NetworkStatusBanner />
        <PageNav title={profileTitle} fallback={id ? `/chat/${id}` : '/home'} />
      </IonHeader>
      <IonContent className="profile-page group-profile-scroll">
        {!conversation || conversation.type !== 'private' || (!other && !isSelf) ? (
          <EmptyState title={t('directMedia.notFound')} />
        ) : (
          <div className="profile-frame">
            <section className="profile-hero">
              {(() => {
                const subject = isSelf ? currentUser : other!;
                return (
                  <>
                    <div
                      className={subject.bannerUrl ? 'profile-banner is-photo' : 'profile-banner'}
                      style={{ '--banner': subject.color } as CSSProperties}
                    >
                      {subject.bannerUrl ? <img src={subject.bannerUrl} alt="" /> : null}
                    </div>
                    <span className="profile-photo group-hero-photo">
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
                    {(customRoleReady(subject) || isSelf) && (
                      <p className="member-chips">
                        <CustomRoleBadge user={subject} />
                        {isSelf && <span className="kind-pill">{t('member.you')}</span>}
                      </p>
                    )}
                  </>
                );
              })()}
            </section>
            {!isSelf && other && (
              <dl className="account-facts">
                <div>
                  <dt>{t('directMedia.nameFont')}</dt>
                  <dd>{fontLabel(other.messageFont)}</dd>
                </div>
                <div>
                  <dt>{t('directMedia.nameColor')}</dt>
                  <dd className="profile-style-swatch" style={{ '--style-color': other.color } as CSSProperties}>
                    <span aria-hidden="true" />
                  </dd>
                </div>
              </dl>
            )}
            <section className="profile-bio">
              <span>{t('directMedia.bio')}</span>
              {(isSelf ? currentUser.bio : other?.bio) ? (
                <p dir="auto">{isSelf ? currentUser.bio : other?.bio}</p>
              ) : (
                <p>{t('directMedia.noBio')}</p>
              )}
            </section>
            <MediaTabs
              conversationId={conversation.id}
              scope="chat"
              label={t('member.media')}
              notify={<RoomNotifyPanel conversationId={conversation.id} />}
            />
          </div>
        )}
      </IonContent>
    </IonPage>
  );
}
