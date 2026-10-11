import { useEffect, useState, type RefObject } from 'react';
const targets = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | undefined;
/** A shared observer stops offscreen avatars and hidden Ionic pages. */
export function useVisibleAvatar(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element || typeof IntersectionObserver === 'undefined') return;
    observer ??= new IntersectionObserver(entries => {
      for (const entry of entries) targets.get(entry.target)?.(entry.isIntersecting);
    });
    targets.set(element, setVisible);
    observer.observe(element);
    return () => {
      observer?.unobserve(element); targets.delete(element);
      if (!targets.size) { observer?.disconnect(); observer = undefined; }
    };
  }, [enabled, ref]);
  return enabled && visible;
}
