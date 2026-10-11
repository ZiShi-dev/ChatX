import Avatar from '../common/Avatar';
import { typingComposerCaption, typingLabel } from '../../lib/typing';
import type { User } from '../../types/user';

type TypingIndicatorProps = {
  names: string[];
  typists?: Pick<User, 'displayName' | 'color' | 'avatarUrl' | 'avatarDecoration'>[];
};

export default function TypingIndicator({ names, typists }: TypingIndicatorProps) {
  const spoken = typingLabel(names);
  const caption = typingComposerCaption(names);
  if (!spoken) return null;

  const solo = typists?.length === 1 ? typists[0] : undefined;

  return (
    <div className="composer-typing" role="status" aria-live="polite" aria-label={spoken}>
      {solo ? (
        <Avatar
          name={solo.displayName}
          color={solo.color}
          size={34}
          src={solo.avatarUrl}
          decoration={solo.avatarDecoration}
        />
      ) : null}
      <span className="typing-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="composer-typing-label" dir="auto">{caption}</span>
    </div>
  );
}
