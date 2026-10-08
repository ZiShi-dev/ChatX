const positions = new Map<string, number>();

export function rememberScroll(conversationId: string, top: number) {
  positions.set(conversationId, top);
}

export function recalledScroll(conversationId: string) {
  return positions.get(conversationId);
}
