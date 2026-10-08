import UserListItem from '../users/UserListItem';
import { roleLabel } from '../../lib/roles';
import type { User } from '../../types/user';

type MemberListProps = {
  title: string;
  users: User[];
  adminId?: string;
  onSelect: (user: User) => void;
};

export default function MemberList({ title, users, adminId, onSelect }: MemberListProps) {
  if (users.length === 0) return null;
  return (
    <section className="member-section">
      <h3>{title}</h3>
      {users.map((user) => (
        <UserListItem
          key={user.id}
          user={user}
          badge={roleLabel(user.role) || (user.id === adminId ? 'مشرف' : undefined)}
          onClick={() => onSelect(user)}
        />
      ))}
    </section>
  );
}
