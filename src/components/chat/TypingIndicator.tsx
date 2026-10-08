type TypingIndicatorProps = {
  names: string[];
};

export default function TypingIndicator({ names }: TypingIndicatorProps) {
  if (names.length === 0) return null;
  const label = names.length === 1 ? `${names[0]} يكتب…` : `${names.join('، ')} يكتبون…`;
  return <p className="typing-indicator">{label}</p>;
}
