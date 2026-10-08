export function nextBanner(action: 'remove' | string) {
  return action === 'remove' ? undefined : action;
}
