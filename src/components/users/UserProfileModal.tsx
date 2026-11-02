import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import { IonIcon } from '@ionic/react';
import { chatbubbleOutline } from 'ionicons/icons';
import Avatar from '../common/Avatar';
import CustomRoleBadge from '../common/CustomRoleBadge';
import { customRoleReady } from '../../lib/customRole';
import { useProfileMotion } from '../../hooks/useProfileMotion';
import { connectionLabel } from '../../lib/presence';
import { roleLabel } from '../../lib/roles';
import { displayNameStyleForUser } from '../../lib/userStyle';
import { t, useI18n } from '../../lib/i18n';
import type { User } from '../../types/user';

type RoomContext = {
  name: string;
  adminId?: string;
};

type UserProfileModalProps = {
  user?: User;
  isSelf: boolean;
  room?: RoomContext;
  onClose: () => void;
  onMessage: (userId: string) => void;
  onMedia?: () => void;
};

function chipsFor(user: User, isSelf: boolean, room?: RoomContext) {
  return [
    isSelf ? t('member.you') : '',
    roleLabel(user.role),
    room?.adminId === user.id ? t('member.mod') : '',
  ].filter((label): label is string => Boolean(label));
}

export default function UserProfileModal({ user, isSelf, room, onClose, onMessage, onMedia }: UserProfileModalProps) {
  const animate = useProfileMotion();
  useI18n();
  if (!user) return null;
  const chips = chipsFor(user, isSelf, room);
  const showChips = customRoleReady(user) || chips.length > 0;
  return createPortal(
    <div className="app-scrim sheet" onClick={onClose}>
      <div className="app-sheet profile-pop member-sheet" role="dialog" aria-labelledby="member-sheet-name" onClick={(event) => event.stopPropagation()}>
        <span className="app-handle" />
        <section className="profile-hero">
          <div className={user.bannerUrl ? 'profile-banner is-photo' : 'profile-banner'} style={{ '--banner': user.color } as CSSProperties}>
            {user.bannerUrl ? <img src={user.bannerUrl} alt="" /> : null}
          </div>
          <div className="profile-photo">
            <Avatar name={user.displayName} color={user.color} size={96} src={user.avatarUrl} decoration={user.avatarDecoration} animate={animate} />
          </div>
          <h2 id="member-sheet-name" {...displayNameStyleForUser(user.color, user.messageFont)} dir="auto">{user.displayName}</h2>
          <p className="profile-handle" dir="auto">@{user.username}</p>
          <p className="profile-status">
            <i className={user.status === 'online' ? 'on' : ''} />
            {connectionLabel(user, { self: isSelf })}
          </p>
          {showChips && (
            <p className="member-chips">
              <CustomRoleBadge user={user} />
              {chips.map((label) => <span key={label} className="kind-pill">{label}</span>)}
            </p>
          )}
          {room && <p className="member-room">{t('member.inRoom', { name: room.name })}</p>}
          <section className="profile-bio member-bio">
            <span>{t('member.bio')}</span>
            {user.bio ? <p dir="auto">{user.bio}</p> : <p>{t('member.noBio')}</p>}
          </section>
        </section>
        {isSelf ? (
          <p className="member-self">{room ? t('member.selfRoom') : t('member.self')}</p>
        ) : (
          <button type="button" className="profile-pop-action" onClick={() => onMessage(user.id)}>
            <span>{t('member.message')}</span>
            <IonIcon icon={chatbubbleOutline} />
          </button>
        )}
        {onMedia && <button type="button" className="cancel" onClick={onMedia}>{t('member.media')}</button>}
        <button type="button" className="cancel" onClick={onClose}>{t('member.close')}</button>
      </div>
    </div>,
    document.body,
  );
}
