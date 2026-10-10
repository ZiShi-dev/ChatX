import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MessageBubble from './MessageBubble';
import { useChatStore } from '../../stores/chatStore';
import { useUserStore } from '../../stores/userStore';
import type { Message } from '../../types/message';
const oldReply = useChatStore.getState().beginReply, oldUsers = useUserStore.getState().users;
afterEach(() => { cleanup(); useChatStore.setState({ beginReply: oldReply }); useUserStore.setState({ users: oldUsers }); document.documentElement.dir = ''; });
function pointer(node: Element, type: string, x: number) { const event = new MouseEvent(type, { bubbles: true, clientX: x, button: 0 }); Object.defineProperty(event, 'pointerId', { value: 1 }); fireEvent(node, event); }
it.each(['@Bob', '@everyone'])('can reply by swiping a message containing %s', text => {
  document.documentElement.dir = 'rtl';
  const reply = vi.fn(); useChatStore.setState({ beginReply: reply });
  useUserStore.setState({ users: [{ ...oldUsers[0], id: 'bob', username: 'Bob', displayName: 'Bob' }] });
  const message: Message = { id: 'mention', conversationId: 'group', senderId: 'bob', type: 'text', text, status: 'sent', createdAt: '2026-10-10T10:00:00.000Z' };
  const { container } = render(<MessageBubble message={message} mine={false} showAuthor={false} onOpenProfile={vi.fn()} />);
  const start = text === '@Bob' ? screen.getByRole('button', { name: '@Bob' }) : container.querySelector('.bubble-mention')!;
  pointer(start, 'pointerdown', 180); pointer(start, 'pointermove', 100); pointer(start, 'pointerup', 100);
  expect(reply).toHaveBeenCalledWith('mention');
});
