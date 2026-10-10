import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MessageBubble from './MessageBubble';
import { useAuthStore } from '../../stores/authStore';
import { useUserStore } from '../../stores/userStore';
import type { Message } from '../../types/message';

const oldAuth = useAuthStore.getState().currentUser;
const oldUsers = useUserStore.getState().users;

afterEach(() => {
  cleanup();
  useAuthStore.setState({ currentUser: oldAuth });
  useUserStore.setState({ users: oldUsers });
});

it('shows peer name color and font without styling the bubble', () => {
  const peer = {
    ...oldUsers[0],
    id: 'peer-1111-4111-8111-111111111111',
    displayName: 'ليلى',
    username: 'ليلى',
    color: '#a56b7a',
    messageFont: 'classic' as const,
  };
  useAuthStore.setState({ currentUser: { ...oldAuth, id: 'me-1111-4111-8111-111111111111', username: 'نورة' } });
  useUserStore.setState({ users: [peer] });
  const message: Message = {
    id: 'styled',
    conversationId: 'group',
    senderId: peer.id,
    type: 'text',
    text: 'مرحبًا',
    status: 'sent',
    createdAt: '2026-10-10T10:00:00.000Z',
  };
  const { container } = render(
    <MessageBubble message={message} mine={false} showAuthor author={peer} onOpenProfile={vi.fn()} />,
  );
  const author = container.querySelector('button.bubble-author')!;
  expect(author.className).toContain('has-user-display');
  expect(author.className).toContain('is-name-font-classic');
  expect((author as HTMLElement).style.color).toMatch(/165,\s*107,\s*122|#a56b7a/i);
  expect(container.querySelector('.bubble.has-user-display')).toBeNull();
});

it('keeps default bubble classes for outgoing messages', () => {
  useAuthStore.setState({
    currentUser: {
      ...oldAuth,
      id: 'me-1111-4111-8111-111111111111',
      color: '#4d7ea8',
      messageFont: 'clear',
    },
  });
  const message: Message = {
    id: 'mine',
    conversationId: 'group',
    senderId: 'me-1111-4111-8111-111111111111',
    type: 'text',
    text: 'رسالتي',
    status: 'sent',
    createdAt: '2026-10-10T10:00:00.000Z',
  };
  const { container } = render(<MessageBubble message={message} mine showAuthor={false} />);
  expect(container.querySelector('.bubble.has-user-display')).toBeNull();
  expect(container.querySelector('.bubble-stack.mine .bubble')).toBeTruthy();
});
