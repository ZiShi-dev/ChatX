import { useEffect, useState, type RefObject } from 'react';
import { useMotionTier } from './useMotionTier';
const targets = new Map<Element, (visible: boolean) => void>();
const visibleTargets = new Set<Element>();
let observer: IntersectionObserver | undefined;
function distribute() {
  const limit = document.documentElement.dataset.motionTier === 'full' ? 6 : 2;
  let count = 0;
  for (const [element, callback] of targets) callback(visibleTargets.has(element) && ++count <= limit);
}
/** A shared observer stops offscreen avatars and hidden Ionic pages. */
export function useVisibleAvatar(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  const tier = useMotionTier();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element || typeof IntersectionObserver === 'undefined') return;
    observer ??= new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visibleTargets.add(entry.target);
        else visibleTargets.delete(entry.target);
      }
      distribute();
    });
    targets.set(element, setVisible);
    observer.observe(element);
    return () => {
      observer?.unobserve(element); targets.delete(element); visibleTargets.delete(element); distribute();
      if (!targets.size) { observer?.disconnect(); observer = undefined; }
    };
  }, [enabled, ref, tier]);
  return enabled && visible;
}
