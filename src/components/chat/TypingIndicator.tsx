import { typingLabel } from '../../lib/typing';

type TypingIndicatorProps = {
  names: string[];
};

export default function TypingIndicator({ names }: TypingIndicatorProps) {
  const label = typingLabel(names);
  return (
    <p className={label ? "typing-indicator" : "typing-indicator is-idle"} role="status" aria-live="polite">
      {label && <span className="typing-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>}
      <span>{label}</span>
    </p>
  );
}
