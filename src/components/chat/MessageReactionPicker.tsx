import EmojiText from '../common/EmojiText';
import { QUICK_REACTIONS } from '../../lib/reactions';

type MessageReactionPickerProps = {
  mineEmojis: readonly string[];
  keyboardOpen: boolean;
  onPick: (emoji: string) => void;
  onExpand: () => void;
};

export default function MessageReactionPicker({ mineEmojis, keyboardOpen, onPick, onExpand }: MessageReactionPickerProps) {
  const owned = new Set(mineEmojis);

  return (
    <div className="message-reaction-picker">
      <div className="reaction-bar" role="group" aria-label="تفاعلات سريعة">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={owned.has(emoji) ? 'is-on is-locked' : undefined}
            aria-label={emoji}
            aria-pressed={owned.has(emoji)}
            aria-disabled={owned.has(emoji)}
            disabled={owned.has(emoji)}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onPick(emoji);
            }}
          >
            <EmojiText text={emoji} />
          </button>
        ))}
        <button
          type="button"
          className={`reaction-more-toggle${keyboardOpen ? ' is-on' : ''}`}
          aria-expanded={keyboardOpen}
          aria-label="اختيار أي إيموجي"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onExpand();
          }}
        >
          <span className="reaction-plus" aria-hidden="true">+</span>
        </button>
      </div>
    </div>
  );
}
