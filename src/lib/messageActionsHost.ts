export const MESSAGE_ACTIONS_HOST_ID = 'chatx-message-actions-host';

export function resolveMessageActionsHost(from?: Element | null): HTMLElement | null {
  const byId = document.getElementById(MESSAGE_ACTIONS_HOST_ID);
  if (byId instanceof HTMLElement) return byId;
  const page = from?.closest('ion-page') ?? document.querySelector('ion-page:not(.ion-page-hidden)');
  const inPage = page?.querySelector('.message-actions-host');
  if (inPage instanceof HTMLElement) return inPage;
  const slot = page?.querySelector('.chat-navigation-slot .message-actions-host');
  return slot instanceof HTMLElement ? slot : null;
}

export function chatNavigationSlot(from?: Element | null): HTMLElement | null {
  const page = from?.closest('ion-page') ?? document.querySelector('ion-page:not(.ion-page-hidden)');
  const slot = page?.querySelector('.chat-navigation-slot');
  return slot instanceof HTMLElement ? slot : null;
}
