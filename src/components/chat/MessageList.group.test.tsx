import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MessageList from './MessageList';
import { useAuthStore } from '../../stores/authStore';
import type { Message } from '../../types/message';
import type { User } from '../../types/user';

const me: User = {
  id: 'me',
  username: 'me',
  displayName: 'أنا',
  role: 'member',
  status: 'online',
  bio: '',
  color: '#4d7ea8',
};

const amina: User = {
  id: 'amina',
  username: 'amina',
  displayName: 'أمينة',
  role: 'member',
  status: 'online',
  bio: '',
  color: '#a56b7a',
};

afterEach(() => {
  cleanup();
});

it('shows the name once and the photo at the end of a burst', () => {
  useAuthStore.setState({ currentUser: me });
  const messages: Message[] = [
    { id: 'a1', conversationId: 'room', senderId: 'amina', type: 'text', text: 'واحد', status: 'sent', createdAt: '2026-10-11T10:00:00.000Z' },
    { id: 'a2', conversationId: 'room', senderId: 'amina', type: 'text', text: 'اثنان', status: 'sent', createdAt: '2026-10-11T10:01:00.000Z' },
  ];
  const { container } = render(
    <MessageList
      messages={messages}
      limit={30}
      showAuthor
      conversationId="room"
      memberIds={['me', 'amina']}
      users={[me, amina]}
      currentUserId="me"
      onOpenProfile={vi.fn()}
      onLoadOlder={async () => false}
    />,
  );
  const stacks = [...container.querySelectorAll('.bubble-stack')];
  expect(stacks).toHaveLength(2);
  expect(stacks[0].querySelector('.bubble-author')).toBeTruthy();
  expect(stacks[0].querySelector('.bubble-person')).toBeNull();
  expect(stacks[0].querySelector('.bubble-person-gap')).toBeTruthy();
  expect(stacks[1].className).toContain('is-continued');
  expect(stacks[1].querySelector('.bubble-author')).toBeNull();
  expect(stacks[1].querySelector('.bubble-person-gap')).toBeNull();
  expect(stacks[1].querySelector('button.bubble-person')).toBeTruthy();
});
