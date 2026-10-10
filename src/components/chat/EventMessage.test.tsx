import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import EventMessage from './EventMessage';
import { useChatStore } from '../../stores/chatStore';
import type { Message } from '../../types/message';
const original = useChatStore.getState().beginReply;
afterEach(() => { cleanup(); useChatStore.setState({ beginReply: original }); });
const message: Message = { id: 'event', conversationId: 'group', senderId: 'sender', type: 'text', text: 'تنبيه @everyone', status: 'sent', createdAt: '2026-10-10T10:00:00.000Z', event: true };
function pointer(node: Element, type: string, x: number, y = 0) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }); Object.defineProperty(event, 'pointerId', { value: 1 }); fireEvent(node, event);
}
it.each([-80, 80])('replies to the exact event by swiping in either direction (%s)', dx => {
  const reply = vi.fn(); useChatStore.setState({ beginReply: reply }); const { container } = render(<EventMessage message={message} />); const event = container.firstElementChild!;
  pointer(event, 'pointerdown', 100); pointer(event, 'pointermove', 100 + dx); pointer(event, 'pointerup', 100 + dx);
  expect(reply).toHaveBeenCalledWith('event');
});
it('keeps vertical scrolling and short drags from replying, and offers an accessible reply button', () => {
  const reply = vi.fn(); useChatStore.setState({ beginReply: reply }); const { container } = render(<EventMessage message={message} />); const event = container.firstElementChild!;
  pointer(event, 'pointerdown', 100); pointer(event, 'pointermove', 103, 80); pointer(event, 'pointerup', 180, 80); expect(reply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'الرد على هذا التنبيه' })); expect(reply).toHaveBeenCalledWith('event');
});
it('does not offer a reply to deleted or locked events', () => {
  render(<EventMessage message={{ ...message, deletedForEveryone: true }} />); expect(screen.queryByRole('button')).toBeNull();
});
