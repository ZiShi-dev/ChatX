import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import MessageBubble from './MessageBubble';
import type { Message } from '../../types/message';
afterEach(cleanup);
const message: Message = { id: 'emoji-test', conversationId: 'room', senderId: 'me', type: 'text', text: '😀', status: 'sent', createdAt: '2026-10-12T10:00:00.000Z' };
it('gives one emoji a frameless message with the send time and seen status', () => {
  const { container } = render(<MessageBubble message={message} mine showAuthor={false} direct directSeen />);
  expect(container.querySelector('.bubble.is-single-emoji')).not.toBeNull();
  expect(container.querySelector('.bubble-time')?.textContent).toBeTruthy();
  expect(container.querySelector('.status-mark.seen')).not.toBeNull();
});
it('keeps a bubble for several emojis and keeps reply references intact', () => {
  const { container, rerender } = render(<MessageBubble message={{ ...message, text: '😀 🐱' }} mine showAuthor={false} />);
  expect(container.querySelector('.bubble.is-single-emoji')).toBeNull();
  expect(container.querySelector('.bubble-text.is-emoji-2')).not.toBeNull();
  rerender(<MessageBubble message={{ ...message, replyToId: 'original' }} mine showAuthor={false} />);
  expect(container.querySelector('.reply-ref')).not.toBeNull();
});
