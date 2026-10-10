import { useEffect, useRef } from 'react';

const closers: Array<() => void> = [];

/** Register a custom overlay (search panel, etc.) that should close before route back. */
export function registerOverlayClose(close: () => void) {
  closers.push(close);
  return () => {
    const index = closers.lastIndexOf(close);
    if (index >= 0) closers.splice(index, 1);
  };
}

function openModals() {
  return [...document.querySelectorAll('ion-modal')].filter(
    (node) => (node as HTMLIonModalElement).isOpen,
  ) as HTMLIonModalElement[];
}

/** Close the topmost overlay. Returns true when something was dismissed. */
export function closeTopOverlay(): boolean {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
    return true;
  }
  const modal = openModals().at(-1);
  if (modal) {
    void modal.dismiss(undefined, 'back');
    return true;
  }
  const scrim = document.querySelector('.app-scrim, .wa-scrim');
  if (scrim instanceof HTMLElement) {
    scrim.click();
    return true;
  }
  const sheet = document.querySelector('ion-action-sheet.show-modal, ion-popover.show-modal') as { dismiss?: () => Promise<void> } | null;
  if (sheet?.dismiss) {
    void sheet.dismiss();
    return true;
  }
  const close = closers.at(-1);
  if (close) {
    close();
    return true;
  }
  return false;
}

/** History entry so the system back gesture closes the overlay instead of leaving the page. */
export function useOverlayHistory(open: boolean, onClose: () => void) {
  const keyRef = useRef('');
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const key = `chatx-${Date.now()}`;
    keyRef.current = key;
    window.history.pushState({ chatxOverlay: key }, '');
    const onPop = () => {
      keyRef.current = '';
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (keyRef.current && window.history.state?.chatxOverlay === keyRef.current) {
        keyRef.current = '';
        window.history.back();
      }
    };
  }, [open]);
}

export function dismissOverlayHistory() {
  if (window.history.state?.chatxOverlay) window.history.back();
}
