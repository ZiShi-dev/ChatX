const REACTION_BAND = 64;
const VIEW_MARGIN = 12;

export function messageActionsViewport(page?: ParentNode | null) {
  const scope = page instanceof Element ? page : document;
  const footer = scope.querySelector('ion-footer.chat-footer, .chat-footer');
  const footerHeight = footer?.getBoundingClientRect().height ?? 72;
  const header = scope.querySelector('ion-header');
  const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
  const visibleTop = headerBottom + VIEW_MARGIN;
  const visibleBottom = window.innerHeight - footerHeight - REACTION_BAND - VIEW_MARGIN;
  const visibleHeight = Math.max(140, visibleBottom - visibleTop);
  return { visibleTop, visibleBottom, visibleHeight, reactionBand: REACTION_BAND, footerHeight };
}

/** Place the message in the visible band above the composer, like when the keyboard is open. */
export function scrollMessageForActions(scroller: HTMLElement, message: HTMLElement) {
  const page = message.closest('ion-page');
  const { visibleTop, visibleHeight } = messageActionsViewport(page);
  const rect = message.getBoundingClientRect();
  const targetTop = visibleTop + visibleHeight * 0.38 - rect.height * 0.45;
  const delta = rect.top - targetTop;
  scroller.scrollTop = Math.max(0, scroller.scrollTop + delta);
}

export function chatDeepLink(conversationId: string, messageId: string, kind?: string) {
  const params = new URLSearchParams();
  params.set('at', messageId);
  if (kind === 'reaction') params.set('react', '1');
  return `/chat/${conversationId}?${params.toString()}`;
}
