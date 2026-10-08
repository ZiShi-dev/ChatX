import type { InboxKind } from './inbox';

let filter: 'all' | InboxKind = 'all';
let scrollTop = 0;

export function recalledInboxFilter() {
  return filter;
}

export function rememberInboxFilter(next: 'all' | InboxKind) {
  filter = next;
}

export function recalledInboxScroll() {
  return scrollTop;
}

export function rememberInboxScroll(top: number) {
  scrollTop = top;
}
