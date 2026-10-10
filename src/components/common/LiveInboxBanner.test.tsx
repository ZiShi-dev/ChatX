import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import LiveInboxBanner from './LiveInboxBanner';
import { useLiveInbox } from '../../lib/liveInbox';
import { useMuteStore } from '../../stores/muteStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { DEFAULT_NOTIFY_TYPES } from '../../lib/inbox';
afterEach(() => { cleanup(); useLiveInbox.getState().clear(); useMuteStore.setState({ mutes: [] }); useSettingsStore.setState({ notifyTypes: { ...DEFAULT_NOTIFY_TYPES } }); vi.useRealTimers(); });
const notice = { key: 'one', conversationId: 'group', messageId: 'one', kind: 'message' as const, title: 'Group', body: 'New message' };
it('hides the banner of the chat already open and shows one from another chat', () => {
  useLiveInbox.getState().push(notice);
  const here = render(<MemoryRouter initialEntries={['/chat/group']}><LiveInboxBanner /></MemoryRouter>);
  expect(screen.queryByRole('status')).toBeNull();
  here.unmount();
  useLiveInbox.getState().push(notice);
  render(<MemoryRouter initialEntries={['/home']}><LiveInboxBanner /></MemoryRouter>);
  expect(screen.getByRole('status')).toHaveTextContent('New message');
  fireEvent.click(screen.getByRole('button', { name: 'إخفاء الإشعار' }));
  expect(screen.queryByRole('status')).toBeNull();
});
it('respects disabled types and room mute without replaying disabled notifications', () => {
  useSettingsStore.setState({ notifyTypes: { ...DEFAULT_NOTIFY_TYPES, message: false } });
  useLiveInbox.getState().push(notice);
  render(<MemoryRouter><LiveInboxBanner /></MemoryRouter>);
  expect(screen.queryByRole('status')).toBeNull(); expect(useLiveInbox.getState().notices).toHaveLength(0);
});
it('shows every queued alert in arrival order, including more than three alerts', async () => {
  vi.useFakeTimers();
  for (let i = 0; i < 5; i++) useLiveInbox.getState().push({ ...notice, key: `${i}`, body: `Message ${i}` });
  render(<MemoryRouter><LiveInboxBanner /></MemoryRouter>);
  for (let i = 0; i < 5; i++) { expect(screen.getByRole('status')).toHaveTextContent(`Message ${i}`); fireEvent.click(screen.getByRole('button', { name: 'إخفاء الإشعار' })); }
  expect(screen.queryByRole('status')).toBeNull();
});
