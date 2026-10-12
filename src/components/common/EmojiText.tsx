import { Fragment, memo, useState } from 'react';
import { emojiOnlyCount, emojiParts } from '../../lib/emoji';
import './EmojiText.css';

const EmojiGlyph = memo(function EmojiGlyph({ text, asset }: { text: string; asset: string | null }) {
  const [failed, setFailed] = useState(false);
  const fallback = failed || !asset;
  return (
    <span className={`chat-emoji${fallback ? ' is-fallback' : ''}`} dir="ltr">
      <span>{text}</span>
      {!fallback && asset && <img src={asset} alt="" aria-hidden="true" width="64" height="64" loading="lazy" decoding="async" draggable="false" onError={() => setFailed(true)} />}
    </span>
  );
});

export default memo(function EmojiText({ text }: { text: string }) {
  return <>{emojiParts(text).map((part, index) => part.asset || emojiOnlyCount(part.text) === 1
    ? <EmojiGlyph key={`${index}-${part.text}`} text={part.text} asset={part.asset} />
    : <Fragment key={index}>{part.text}</Fragment>)}</>;
});
