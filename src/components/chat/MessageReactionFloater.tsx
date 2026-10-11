import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { messageActionsViewport } from '../../lib/messageFocusScroll';
import MessageReactionPicker from './MessageReactionPicker';
import './MessageReactionFloater.css';

type Box = { top: number; left: number; flip: boolean };

type MessageReactionFloaterProps = {
  anchorRef: RefObject<HTMLElement | null>;
  mineEmojis: readonly string[];
  keyboardOpen: boolean;
  onPick: (emoji: string) => void;
  onExpand: () => void;
};

export default function MessageReactionFloater({ anchorRef, mineEmojis, keyboardOpen, onPick, onExpand }: MessageReactionFloaterProps) {
  const root = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const float = root.current;
    if (!anchor || !float) return;
    const bubble = anchor.querySelector('.bubble') ?? anchor;
    const rect = bubble.getBoundingClientRect();
    const floatRect = float.getBoundingClientRect();
    const floatH = floatRect.height > 0 ? floatRect.height : 52;
    const gap = 8;
    const page = anchor.closest('ion-page');
    const { visibleTop, visibleBottom } = messageActionsViewport(page);
    const minTop = visibleTop;
    const maxBottom = visibleBottom;
    let top = rect.top - floatH - gap;
    let flip = false;
    if (top < minTop || top + floatH > rect.top) {
      const below = rect.bottom + gap;
      if (below + floatH <= maxBottom) {
        top = below;
        flip = true;
      } else {
        top = Math.max(minTop, Math.min(rect.top - floatH - gap, maxBottom - floatH));
      }
    }
    if (top + floatH > maxBottom) {
      top = Math.max(minTop, maxBottom - floatH);
    }
    const floatW = floatRect.width > 0 ? floatRect.width : Math.min(window.innerWidth - 24, 360);
    const margin = 12;
    let center = rect.left + rect.width / 2;
    const minCenter = margin + floatW / 2;
    const maxCenter = window.innerWidth - margin - floatW / 2;
    if (maxCenter > minCenter) center = Math.min(maxCenter, Math.max(minCenter, center));
    else center = window.innerWidth / 2;
    setBox({ top, left: center, flip });
  }, [anchorRef]);

  useLayoutEffect(() => {
    place();
    const anchor = anchorRef.current;
    const page = anchor?.closest('ion-page');
    const content = page?.querySelector('ion-content');
    const onMove = () => place();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    let scroller: HTMLElement | null = null;
    void content?.getScrollElement().then((el) => {
      scroller = el;
      el.addEventListener('scroll', onMove, { passive: true });
    });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onMove) : null;
    if (observer) {
      if (anchor) observer.observe(anchor);
      if (root.current) observer.observe(root.current);
    }
    const raf = window.requestAnimationFrame(() => place());
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
      observer?.disconnect();
      scroller?.removeEventListener('scroll', onMove);
    };
  }, [anchorRef, place]);

  const style = box
    ? { top: `${box.top}px`, left: `${box.left}px`, transform: 'translateX(-50%)' }
    : { visibility: 'hidden' as const };

  return (
    <div
      ref={root}
      className={`message-reaction-float${box?.flip ? ' is-below' : ''}`}
      style={style}
      dir="rtl"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <MessageReactionPicker mineEmojis={mineEmojis} keyboardOpen={keyboardOpen} onPick={onPick} onExpand={onExpand} />
    </div>
  );
}
