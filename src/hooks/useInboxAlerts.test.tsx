import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useInboxAlerts } from './useInboxAlerts';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { useLiveInbox } from '../lib/liveInbox';
import { useMuteStore } from '../stores/muteStore';
import { useSettingsStore } from '../stores/settingsStore';
import { DEFAULT_NOTIFY_TYPES, type InboxItem } from '../lib/inbox';
const notify = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../lib/notifications', () => ({ notifyChatMessage: notify }));
vi.mock('../lib/poll', () => ({ startPolling: () => () => undefined }));
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
it('does not replay history; shows new current-chat messages even if a read receipt already arrived', () => {
  window.history.replaceState({}, '', `/chat/${room}`); mount();
  expect(useLiveInbox.getState().notices).toHaveLength(0);
  act(() => useChatStore.setState({ serverInbox: [item('new'), item('history')] }));
  expect(useLiveInbox.getState().notices[0]?.messageId).toBe('new');
  act(() => useChatStore.setState({ serverInbox: [item('new'), item('history')] }));
  expect(useLiveInbox.getState().notices).toHaveLength(1);
});
it('delivers background unread notifications to the system and honors disabled types', () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden'); mount();
  act(() => useChatStore.setState({ serverInbox: [{ ...item('new'), unread: true, unreadCount: 1 }] }));
  expect(notify).toHaveBeenCalledOnce(); expect(useLiveInbox.getState().notices).toHaveLength(0);
  useSettingsStore.setState({ notifyTypes: { ...DEFAULT_NOTIFY_TYPES, message: false } });
  act(() => useChatStore.setState({ serverInbox: [{ ...item('muted'), unread: true, unreadCount: 1 }] }));
  expect(notify).toHaveBeenCalledOnce();
});
