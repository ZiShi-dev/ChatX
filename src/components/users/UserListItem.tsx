import { IonIcon, IonItem, IonLabel } from '@ionic/react';
import { trashOutline } from 'ionicons/icons';
import Avatar from '../common/Avatar';
import { connectionLabel } from '../../lib/presence';
import { useAuthStore } from '../../stores/authStore';
import { roleLabel } from '../../lib/roles';
import type { User } from '../../types/user';

type UserListItemProps = {
  user: User;
  onClick: () => void;
  onDelete?: () => void;
  badge?: string;
};

export default function UserListItem({ user, onClick, onDelete, badge }: UserListItemProps) {
  const self = useAuthStore((state) => state.currentUser.id) === user.id;
  return (
    <IonItem button={!onDelete} detail={false} className="member-row" onClick={onClick}>
      <Avatar slot="start" name={user.displayName} color={user.color} src={user.avatarUrl} decoration={user.avatarDecoration} />
      <IonLabel>
        <h2>
          {user.displayName}
          {(badge || roleLabel(user.role)) && <span className="role-badge">{badge || roleLabel(user.role)}</span>}
        </h2>
        <p dir="auto">@{user.username}</p>
      </IonLabel>
      <span className={`status-dot ${user.status}`} slot="end">
        {connectionLabel(user, { self })}
      </span>
      {onDelete && (
        <button
          slot="end"
          type="button"
          className="account-delete"
          aria-label="حذف الحساب"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <IonIcon icon={trashOutline} />
        </button>
      )}
    </IonItem>
  );
}
