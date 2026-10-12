import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import LiveInboxBanner from './LiveInboxBanner';
import { useLiveInbox } from '../../lib/liveInbox';
import { useMuteStore } from '../../stores/muteStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useChatStore } from '../../stores/chatStore';
import { DEFAULT_NOTIFY_TYPES, type InboxItem } from '../../lib/inbox';
afterEach(() => { cleanup(); useLiveInbox.getState().clear(); useChatStore.setState({ serverInbox: [] }); useMuteStore.setState({ mutes: [] }); useSettingsStore.setState({ notifyTypes: { ...DEFAULT_NOTIFY_TYPES } }); vi.useRealTimers(); });
const room = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const inboxRow = (id: string): InboxItem => ({ id, ids: [id], count: 1, conversationId: room, conversationType: 'private', senderId: 'sender', kind: 'message', createdAt: '2026-10-10T00:00:00.000Z', preview: id, unread: true, unreadCount: 1, suppressed: false });
const notice = { key: 'one', conversationId: room, conversationType: 'private' as const, messageId: 'one', kind: 'message' as const, title: 'خاص', body: 'New message' };
function primeInbox(id = 'one') {
  useChatStore.setState({ serverInbox: [inboxRow(id)] });
}
it('hides the banner of the chat already open and shows one from another chat', () => {
  primeInbox();
  useLiveInbox.getState().push(notice);
  const here = render(<MemoryRouter initialEntries={[`/chat/${room}`]}><LiveInboxBanner /></MemoryRouter>);
  expect(screen.queryByRole('status')).toBeNull();
  here.unmount();
  primeInbox('two');
  useLiveInbox.getState().push({ ...notice, key: 'two', messageId: 'two' });
  render(<MemoryRouter initialEntries={['/home']}><LiveInboxBanner /></MemoryRouter>);
  expect(screen.getByRole('status')).toHaveTextContent('New message');
  expect(document.querySelector('.live-inbox-open .avatar')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'إخفاء الإشعار' }));
  expect(screen.queryByRole('status')).toBeNull();
});
it('shows the sender, the message and the room like a Discord toast', () => {
  primeInbox('mention-1');
  useChatStore.setState({ serverInbox: [{ ...inboxRow('mention-1'), kind: 'mention', conversationType: 'group' }] });
  useLiveInbox.getState().push({ ...notice, messageId: 'mention-1', kind: 'mention', conversationType: 'group', senderName: 'ليلى', context: 'المساء', preview: 'مرحبا @نورة', title: 'المساء', body: 'ليلى: مرحبا @نورة' });
  render(<MemoryRouter initialEntries={['/home']}><LiveInboxBanner /></MemoryRouter>);
  const status = screen.getByRole('status');
  expect(status).toHaveTextContent('ليلى');
  expect(status).toHaveTextContent('مرحبا @نورة');
  expect(status).toHaveTextContent('إشارة');
  expect(status).toHaveTextContent('المساء');
  expect(status).not.toHaveTextContent('ليلى: مرحبا');
  expect(document.querySelector('.live-inbox-banner.is-mention')).not.toBeNull();
});
it('respects disabled types and room mute without replaying disabled notifications', () => {
  useSettingsStore.setState({ notifyTypes: { ...DEFAULT_NOTIFY_TYPES, message: false } });
  useLiveInbox.getState().push(notice);
  render(<MemoryRouter><LiveInboxBanner /></MemoryRouter>);
  expect(screen.queryByRole('status')).toBeNull(); expect(useLiveInbox.getState().notices).toHaveLength(0);
});
it('shows every queued alert in arrival order, including more than three alerts', async () => {
  vi.useFakeTimers();
  for (let i = 0; i < 5; i++) {
    useChatStore.setState({ serverInbox: [inboxRow(`${i}`)] });
    useLiveInbox.getState().push({ ...notice, key: `${i}`, messageId: `${i}`, body: `Message ${i}` });
  }
  render(<MemoryRouter><LiveInboxBanner /></MemoryRouter>);
  for (let i = 0; i < 5; i++) { expect(screen.getByRole('status')).toHaveTextContent(`Message ${i}`); fireEvent.click(screen.getByRole('button', { name: 'إخفاء الإشعار' })); }
  expect(screen.queryByRole('status')).toBeNull();
});
