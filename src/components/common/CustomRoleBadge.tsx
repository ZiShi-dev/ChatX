import { customRoleGradient, customRoleReady } from '../../lib/customRole';
import type { User } from '../../types/user';

type CustomRoleBadgeProps = {
  user: Pick<User, 'customRoleLabel' | 'customRoleColors'>;
  className?: string;
};

export default function CustomRoleBadge({ user, className }: CustomRoleBadgeProps) {
  const role = customRoleReady(user);
  if (!role) return null;
  return (
    <span className={['custom-role-pill', className].filter(Boolean).join(' ')} style={customRoleGradient(role.colors)} dir="auto">
      {role.label}
    </span>
  );
}
