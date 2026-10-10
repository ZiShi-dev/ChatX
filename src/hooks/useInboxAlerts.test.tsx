import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useInboxAlerts } from './useInboxAlerts';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { useLiveInbox } from '../lib/liveInbox';
import { useMuteStore } from '../stores/muteStore';
import { useSettingsStore } from '../stores/settingsStore';
import { DEFAULT_NOTIFY_TYPES, type InboxItem } from '../lib/inbox';
import * as inbox from '../lib/inbox';
const poll = vi.hoisted(() => vi.fn<(task: () => Promise<unknown>) => () => void>(() => () => undefined));
const notify = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../lib/notifications', () => ({ notifyChatMessage: notify }));
vi.mock('../lib/poll', () => ({ startPolling: poll }));
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const room = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const initialAuth = useAuthStore.getState();
const item = (id: string): InboxItem => ({ id, ids: [id], count: 1, conversationId: room, senderId: 'sender', kind: 'message', createdAt: '2026-10-10T00:00:00.000Z', preview: id, unread: false, unreadCount: 0, suppressed: false });
afterEach(() => { cleanup(); useLiveInbox.getState().clear(); useChatStore.setState({ serverInbox: [] }); useAuthStore.setState(initialAuth); useMuteStore.setState({ mutes: [] }); useSettingsStore.setState({ notifyTypes: { ...DEFAULT_NOTIFY_TYPES } }); vi.restoreAllMocks(); notify.mockClear(); });
function mount() {
  useAuthStore.setState({ activated: true, currentUser: { ...initialAuth.currentUser, id: owner } });
  useChatStore.setState({ serverInbox: [] });
  renderHook(useInboxAlerts);
  act(() => useChatStore.setState({ serverInbox: [item('history')] }));
}
it('inspects each changed inbox once and still primes an unchanged initial inbox', async () => {
  poll.mockClear();
  const decorate = vi.spyOn(inbox, 'presentInbox');
  const load = vi.spyOn(useChatStore.getState(), 'loadInbox').mockResolvedValue('ok');
  useAuthStore.setState({ activated: true, currentUser: { ...initialAuth.currentUser, id: owner } });
  useChatStore.setState({ serverInbox: [item('history')] });
  renderHook(useInboxAlerts);
  const tick = poll.mock.calls[0][0];
  await act(async () => { await tick(); });
  expect(decorate).toHaveBeenCalledOnce();
  decorate.mockClear();
  load.mockImplementation(async () => {
    useChatStore.setState({ serverInbox: [item('new')] });
    return 'ok';
  });
  await act(async () => { await tick(); });
  expect(decorate).toHaveBeenCalledOnce();
  decorate.mockClear();
  load.mockResolvedValue('ok');
  await act(async () => { await tick(); });
  expect(decorate).not.toHaveBeenCalled();
});
it('does not replay history or banner the chat already on screen', () => {
  window.history.replaceState({}, '', `/chat/${room}`); mount();
  expect(useLiveInbox.getState().notices).toHaveLength(0);
  act(() => useChatStore.setState({ serverInbox: [item('new'), item('history')] }));
  expect(useLiveInbox.getState().notices).toHaveLength(0);
  act(() => useChatStore.setState({ serverInbox: [{ ...item('other'), conversationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }, item('new'), item('history')] }));
  expect(useLiveInbox.getState().notices[0]?.messageId).toBe('other');
});
it('delivers background unread notifications to the system and honors disabled types', () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden'); mount();
  act(() => useChatStore.setState({ serverInbox: [{ ...item('new'), unread: true, unreadCount: 1 }] }));
  expect(notify).toHaveBeenCalledOnce(); expect(useLiveInbox.getState().notices).toHaveLength(0);
  useSettingsStore.setState({ notifyTypes: { ...DEFAULT_NOTIFY_TYPES, message: false } });
  act(() => useChatStore.setState({ serverInbox: [{ ...item('muted'), unread: true, unreadCount: 1 }] }));
  expect(notify).toHaveBeenCalledOnce();
});
it.each([
  ['group', 'private', undefined],
  ['private', 'group', 'Friends group'],
])('shows a %s-to-%s banner without changing the open chat', (openRoom, incomingRoom, conversationName) => {
  window.history.replaceState({}, '', `/chat/${openRoom}`); mount();
  const incoming = { ...item('cross-chat'), conversationId: incomingRoom, conversationName, senderName: 'Bob', unread: true, unreadCount: 1 };
  act(() => useChatStore.setState({ serverInbox: [incoming] }));
  expect(useLiveInbox.getState().notices[0]).toMatchObject({ conversationId: incomingRoom, messageId: 'cross-chat', title: conversationName ?? 'Bob' });
  expect(window.location.pathname).toBe(`/chat/${openRoom}`);
  expect(useChatStore.getState().serverInbox[0].unread).toBe(true);
});
