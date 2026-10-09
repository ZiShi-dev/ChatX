import { useState } from 'react';
import { EMOJI_GROUPS } from '../../lib/emojiCatalog';
import EmojiText from '../common/EmojiText';

type EmojiPanelProps = {
  selected?: string;
  onPick: (emoji: string) => void;
};

export default function EmojiPanel({ selected, onPick }: EmojiPanelProps) {
  const [groupId, setGroupId] = useState(EMOJI_GROUPS[0].id);
  const group = EMOJI_GROUPS.find((item) => item.id === groupId) ?? EMOJI_GROUPS[0];

  return (
    <div className="emoji-panel">
      <div className="emoji-grid" role="listbox" aria-label={group.label}>
        {group.emojis.map((emoji, index) => (
          <button
            key={`${emoji}-${index}`}
            type="button"
            role="option"
            aria-selected={emoji === selected}
            className={emoji === selected ? 'is-on' : undefined}
            aria-label={emoji}
            onClick={() => onPick(emoji)}
          >
            <EmojiText text={emoji} />
          </button>
        ))}
      </div>
      <div className="emoji-tabs" role="tablist" aria-label="أنواع الإيموجي">
        {EMOJI_GROUPS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === group.id}
            aria-label={item.label}
            className={item.id === group.id ? 'is-on' : undefined}
            onClick={() => setGroupId(item.id)}
          >
            <EmojiText text={item.emojis[0]} />
          </button>
        ))}
      </div>
    </div>
  );
}
