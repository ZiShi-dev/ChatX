import { act, cleanup, renderHook } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from '@capacitor/app';
import { useFcmPush } from './useFcmPush';
import { clearReadPushNotifications } from '../lib/readPushNotifications';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { startPushRegistration, stopPushRegistration } from '../lib/pushRegister';
vi.mock('@capacitor/core', async importOriginal => {
  const actual = await importOriginal<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => true } };
});
vi.mock('../lib/fcmEnabled', () => ({ fcmEnabled: () => true }));
vi.mock('../lib/pushRegister', () => ({ startPushRegistration: vi.fn(async () => {}), stopPushRegistration: vi.fn(async () => {}), syncPushPrefs: vi.fn() }));
vi.mock('../lib/readPushNotifications', () => ({ clearReadPushNotifications: vi.fn(async () => {}) }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(async () => ({ remove: async () => {} })) } }));
const auth = useAuthStore.getState(), chat = useChatStore.getState();
afterEach(() => { cleanup(); useAuthStore.setState(auth); useChatStore.setState(chat); vi.useRealTimers(); vi.clearAllMocks(); });
function mount() {
  vi.useFakeTimers();
  useAuthStore.setState({ activated: true, currentUser: { ...auth.currentUser, id: '11111111-1111-4111-8111-111111111111' } });
  const loadInbox = vi.fn(async () => 'ok' as const), loadRoom = vi.fn(async () => true);
  useChatStore.setState({ loadInbox, loadRoom });
  window.history.replaceState({}, '', '/chat/active');
  renderHook(useFcmPush, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
  return { loadInbox, loadRoom };
}
it('keeps Firebase registered when navigating between chats and the home page', () => {
  useAuthStore.setState({ activated: true, currentUser: { ...auth.currentUser, id: '11111111-1111-4111-8111-111111111111' } });
  const { result } = renderHook(() => { useFcmPush(); return useNavigate(); }, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
  expect(startPushRegistration).toHaveBeenCalledOnce();
  act(() => result.current('/chat/one'));
  act(() => result.current('/home'));
  expect(stopPushRegistration).not.toHaveBeenCalled();
  expect(startPushRegistration).toHaveBeenCalledOnce();
});
it('coalesces pushes without losing updates for the active room when another room arrives last', async () => {
  const { loadInbox, loadRoom } = mount();
  act(() => {
    window.dispatchEvent(new CustomEvent('chatx-push-received', { detail: { conversationId: 'active' } }));
    window.dispatchEvent(new CustomEvent('chatx-push-received', { detail: { conversationId: 'other' } }));
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(loadInbox).toHaveBeenCalledOnce(); expect(loadRoom).toHaveBeenCalledOnce(); expect(loadRoom).toHaveBeenCalledWith('active');
});
it('removes delivered alerts when the inbox is cleared', async () => {
  mount();
  const item = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ids: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], unread: true, unreadCount: 1 };
  act(() => useChatStore.setState({ serverInbox: [item] as never }));
  act(() => useChatStore.setState({ serverInbox: [] }));
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(clearReadPushNotifications).toHaveBeenCalledWith([expect.objectContaining({ id: item.id, unread: false })]);
});
it('refreshes both the inbox and the open chat when Android resumes', () => {
  const { loadInbox, loadRoom } = mount();
  const callback = vi.mocked(App.addListener).mock.calls[0][1] as unknown as (state: { isActive: boolean }) => void;
  act(() => callback({ isActive: true }));
  expect(loadInbox).toHaveBeenCalledOnce(); expect(loadRoom).toHaveBeenCalledWith('active');
});
