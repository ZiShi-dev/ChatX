import type { NavigateFunction } from 'react-router-dom';

type Entry = { idx?: number; usr?: { notificationReturn?: { path: string; index?: number } } };
const isChat = (path: string) => /^\/chat\/[^/]+\/?$/.test(path);

/** Opening another notification replaces the active chat, preserving its source page. */
export function openNotificationChat(navigate: NavigateFunction, target: string) {
  const entry = window.history.state as Entry | null;
  const replacing = isChat(window.location.pathname);
  const notificationReturn = replacing
    ? entry?.usr?.notificationReturn ?? { path: '/home' }
    : { path: window.location.pathname === '/activation' ? '/home' : window.location.pathname + window.location.search, index: entry?.idx };
  navigate(target, { replace: replacing, state: { notificationReturn } });
}

/** Used by the chevron and Android back; never walks through older notification targets. */
export function returnFromNotificationChat(navigate: NavigateFunction) {
  if (!isChat(window.location.pathname)) return false;
  const entry = window.history.state as Entry | null;
  const origin = entry?.usr?.notificationReturn;
  if (!origin) return false;
  if (typeof origin.index === 'number' && typeof entry?.idx === 'number' && origin.index < entry.idx) {
    navigate(origin.index - entry.idx);
  } else {
    navigate(origin.path, { replace: true });
  }
  return true;
}
