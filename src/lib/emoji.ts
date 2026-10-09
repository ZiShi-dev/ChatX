import { EMOJI_ASSET_KEYS } from './emojiAssets';

// Keep ZWJ families, modifiers, flags and keycaps together; unsupported sequences stay intact.
const EMOJI_SEQUENCE = /(?:\p{Regional_Indicator}{2}|[#*0-9]\ufe0f?\u20e3|\p{Extended_Pictographic}[\ufe0e\ufe0f]?[\u{1f3fb}-\u{1f3ff}]?(?:\u200d\p{Extended_Pictographic}[\ufe0e\ufe0f]?[\u{1f3fb}-\u{1f3ff}]?)*)(?:[\u{e0020}-\u{e007e}]+\u{e007f})?/gu;

export function emojiAsset(emoji: string) {
  if (emoji.includes('\ufe0e')) return null; // Explicit text presentation.
  const key = [...emoji].filter((part) => part !== '\ufe0f').map((part) => part.codePointAt(0)!.toString(16)).join('-');
  return EMOJI_ASSET_KEYS.has(key) ? `/assets/emoji/${key}.webp` : null;
}

export function emojiParts(text: string) {
  const parts: Array<{ text: string; asset: string | null }> = [];
  let end = 0;
  for (const match of text.matchAll(EMOJI_SEQUENCE)) {
    if (match.index > end) parts.push({ text: text.slice(end, match.index), asset: null });
    parts.push({ text: match[0], asset: emojiAsset(match[0]) });
    end = match.index + match[0].length;
  }
  if (end < text.length) parts.push({ text: text.slice(end), asset: null });
  return parts;
}
