import Avatar from '../common/Avatar';
import { typingLabel } from '../../lib/typing';
import type { User } from '../../types/user';

type TypingIndicatorProps = {
  names: string[];
  typists?: Pick<User, 'id' | 'displayName' | 'color' | 'avatarUrl' | 'avatarDecoration'>[];
};

export default function TypingIndicator({ names, typists }: TypingIndicatorProps) {
  const spoken = typingLabel(names);
  if (!spoken) return null;
  const faces = (typists ?? []).slice(0, 3);

  return (
    <div className="composer-typing" role="status" aria-live="polite" aria-label={spoken}>
      {faces.map((user) => (
        <Avatar
          key={user.id}
          name={user.displayName}
          color={user.color}
          size={18}
          src={user.avatarUrl}
          decoration={user.avatarDecoration}
        />
      ))}
      <span className="typing-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}
