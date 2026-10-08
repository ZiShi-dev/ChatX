import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import { IonIcon } from '@ionic/react';
import { chatbubbleOutline } from 'ionicons/icons';
import Avatar from '../common/Avatar';
import { connectionLabel } from '../../lib/presence';
import { roleLabel } from '../../lib/roles';
import type { User } from '../../types/user';

type UserProfileModalProps = {
  user?: User;
  isSelf: boolean;
  onClose: () => void;
  onMessage: (userId: string) => void;
};

export default function UserProfileModal({ user, isSelf, onClose, onMessage }: UserProfileModalProps) {
  if (!user) return null;
  return createPortal(
    <div className="app-scrim sheet" onClick={onClose}>
      <div className="app-sheet profile-pop" role="dialog" onClick={(event) => event.stopPropagation()}>
        <span className="app-handle" />
        <div className={user.bannerUrl ? 'user-card-banner is-photo' : 'user-card-banner'} style={{ '--banner': user.color } as CSSProperties}>
          {user.bannerUrl ? <img src={user.bannerUrl} alt="" /> : null}
        </div>
        <Avatar name={user.displayName} color={user.color} size={84} src={user.avatarUrl} />
        <h2>{user.displayName}</h2>
        <p className="muted" dir="auto">@{user.username}</p>
        <p>
          {connectionLabel(user, { self: isSelf })}
          {roleLabel(user.role) && <span className="kind-pill">{roleLabel(user.role)}</span>}
        </p>
        {user.bio ? <p className="muted">{user.bio}</p> : null}
        {isSelf ? (
          <p className="muted">هذا حسابك.</p>
        ) : (
          <button type="button" className="profile-pop-action" onClick={() => onMessage(user.id)}>
            <span>إرسال رسالة</span>
            <IonIcon icon={chatbubbleOutline} />
          </button>
        )}
        <button type="button" className="cancel" onClick={onClose}>إغلاق</button>
      </div>
    </div>,
    document.body,
  );
}
