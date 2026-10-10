/** The composer grows over the thread. A taller field must not move the messages. */
export function observeComposerViewport(scroller: HTMLElement, following: { current: boolean }, composer?: HTMLElement | null) {
  let height = scroller.clientHeight;
  let anchor = scroller.scrollTop;
  const resize = () => {
    const next = scroller.clientHeight;
    if (next === height) return;
    const wasFollowing = following.current;
    height = next;
    if (wasFollowing) {
      anchor = scroller.scrollTop = Math.max(0, scroller.scrollHeight - next);
      return;
    }
    if (scroller.scrollTop !== anchor) scroller.scrollTop = anchor;
  };
  const scroll = () => {
    if (scroller.clientHeight !== height) {
      resize();
      return;
    }
    anchor = scroller.scrollTop;
    following.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 96;
  };
  scroller.addEventListener('scroll', scroll, { capture: true, passive: true });
  let frame = 0;
  const input = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(resize);
  };
  composer?.addEventListener('input', input);
  const observer = new ResizeObserver(resize);
  observer.observe(scroller);
  return () => { cancelAnimationFrame(frame); composer?.removeEventListener('input', input); observer.disconnect(); scroller.removeEventListener('scroll', scroll, true); };
}
