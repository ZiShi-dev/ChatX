import { Fragment, memo, useState } from 'react';
import { emojiParts } from '../../lib/emoji';
import './EmojiText.css';

const EmojiGlyph = memo(function EmojiGlyph({ text, asset }: { text: string; asset: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{text}</>;
  return (
    <span className="chat-emoji" dir="ltr">
      <span>{text}</span>
      <img src={asset} alt="" aria-hidden="true" width="64" height="64" loading="lazy" decoding="async" draggable="false" onError={() => setFailed(true)} />
    </span>
  );
});

export default memo(function EmojiText({ text }: { text: string }) {
  return <>{emojiParts(text).map((part, index) => part.asset
    ? <EmojiGlyph key={`${index}-${part.text}`} text={part.text} asset={part.asset} />
    : <Fragment key={index}>{part.text}</Fragment>)}</>;
});
