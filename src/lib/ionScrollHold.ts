import type { RefObject } from 'react';

/** Keeps IonContent scroll position across layout shifts (e.g. profile photo pick). */
export function createScrollHold(contentRef: RefObject<HTMLIonContentElement | null>) {
  let savedTop = 0;
  let pendingPicker = false;

  const apply = async () => {
    const el = await contentRef.current?.getScrollElement();
    if (!el) return;
    el.scrollTop = savedTop;
  };

  const restore = () => {
    pendingPicker = false;
    void apply();
    window.requestAnimationFrame(() => { void apply(); });
    window.setTimeout(() => { void apply(); }, 60);
    window.setTimeout(() => { void apply(); }, 220);
  };

  return {
    hold: async () => {
      const el = await contentRef.current?.getScrollElement();
      savedTop = el?.scrollTop ?? 0;
      pendingPicker = true;
    },
    restore,
    /** Call on window focus after opening the native file picker (cancel or done). */
    onPickerDismiss: () => {
      if (!pendingPicker) return;
      restore();
    },
  };
}
