import { typingLabel } from '../../lib/typing';

type TypingIndicatorProps = {
  names: string[];
};

export default function TypingIndicator({ names }: TypingIndicatorProps) {
  const label = typingLabel(names);
  if (!label) return null;
  return (
    <p className="typing-indicator" role="status" aria-live="polite">
      <span className="typing-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>{label}</span>
    </p>
  );
}
