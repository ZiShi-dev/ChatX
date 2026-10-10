import { memo, useRef } from 'react';
import EmojiText from '../common/EmojiText';
import { useChatStore } from '../../stores/chatStore';
import type { Message } from '../../types/message';
import './EventMessage.css';

function EventMessage({ message, spotlight = false }: { message: Message; spotlight?: boolean }) {
  const beginReply = useChatStore(state => state.beginReply);
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; id: number; locked: boolean } | null>(null);
  const suppressClick = useRef(false);
  const enabled = !message.deletedForEveryone && !message.locked;
  const reset = () => { drag.current = null; if (root.current) root.current.style.transform = ''; };
  return <div ref={root} id={`msg-${message.id}`} className={`chat-event replyable-event${spotlight ? ' is-target' : ''}`} dir="auto"
    onPointerDown={event => { if (!enabled || event.button !== 0 || (event.target as Element).closest('button')) return; suppressClick.current = false; drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId, locked: false }; }}
    onPointerMove={event => {
      const start = drag.current; if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (!start.locked) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { reset(); return; }
        if (Math.abs(dx) < 10) return;
        start.locked = true;
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer may have ended. */ }
      }
      event.currentTarget.style.transform = `translateX(${Math.sign(dx) * Math.min(90, Math.abs(dx))}px)`;
    }}
    onPointerUp={event => {
      const start = drag.current; if (!start || start.id !== event.pointerId) return;
      const reply = start.locked && Math.abs(event.clientX - start.x) >= 64;
      suppressClick.current = start.locked; reset(); if (reply) beginReply(message.id);
    }}
    onPointerCancel={reset}
    onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
    <p><EmojiText text={message.text ?? ''} /></p>
    {enabled && <button type="button" className="event-reply" aria-label="الرد على هذا التنبيه" onClick={() => beginReply(message.id)}>↩</button>}
  </div>;
}
export default memo(EventMessage);
