import { describe, expect, it } from 'vitest';
import { chatDeepLink } from './messageFocusScroll';

describe('chatDeepLink', () => {
  it('ajoute react=1 pour une notification de réaction', () => {
    expect(chatDeepLink('room-1', 'msg-1', 'reaction')).toBe('/chat/room-1?at=msg-1&react=1');
  });

  it('garde un lien simple pour les autres notifications', () => {
    expect(chatDeepLink('room-1', 'msg-1')).toBe('/chat/room-1?at=msg-1');
    expect(chatDeepLink('room-1', 'msg-1', 'mention')).toBe('/chat/room-1?at=msg-1');
  });
});
