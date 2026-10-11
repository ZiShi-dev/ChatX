import { afterEach, expect, it, vi } from 'vitest';
import type { NavigateFunction } from 'react-router-dom';
import { openNotificationChat, returnFromNotificationChat } from './notificationNavigation';

const initialUrl = window.location.href;
const initialState = window.history.state;
afterEach(() => window.history.replaceState(initialState, '', initialUrl));

it('pushes the first chat from the inbox, then replaces subsequent notification targets', () => {
  const navigate = vi.fn() as unknown as NavigateFunction;
  window.history.replaceState({ idx: 3 }, '', '/notifications');
  openNotificationChat(navigate, '/chat/group?at=one');
  const origin = { path: '/notifications', index: 3 };
  expect(navigate).toHaveBeenLastCalledWith('/chat/group?at=one', { replace: false, state: { notificationReturn: origin } });
  window.history.replaceState({ idx: 4, usr: { notificationReturn: origin } }, '', '/chat/group?at=one');
  openNotificationChat(navigate, '/chat/private?at=two');
  expect(navigate).toHaveBeenLastCalledWith('/chat/private?at=two', { replace: true, state: { notificationReturn: origin } });
  expect(returnFromNotificationChat(navigate)).toBe(true);
  expect(navigate).toHaveBeenLastCalledWith(-1);
});

it('returns directly to the source past an older accumulated notification history', () => {
  const navigate = vi.fn() as unknown as NavigateFunction;
  window.history.replaceState({ idx: 9, usr: { notificationReturn: { path: '/notifications', index: 2 } } }, '', '/chat/group');
  returnFromNotificationChat(navigate);
  expect(navigate).toHaveBeenCalledWith(-7);
});

it('uses home for a chat opened directly, while leaving ordinary chat back unchanged', () => {
  const navigate = vi.fn() as unknown as NavigateFunction;
  window.history.replaceState({ idx: 0 }, '', '/chat/group');
  expect(returnFromNotificationChat(navigate)).toBe(false);
  openNotificationChat(navigate, '/chat/private');
  expect(navigate).toHaveBeenCalledWith('/chat/private', { replace: true, state: { notificationReturn: { path: '/home' } } });
  window.history.replaceState({ usr: { notificationReturn: { path: '/home' } } }, '', '/chat/private');
  returnFromNotificationChat(navigate);
  expect(navigate).toHaveBeenLastCalledWith('/home', { replace: true });
});

it('does not override back in chat media or profile subpages', () => {
  const navigate = vi.fn() as unknown as NavigateFunction;
  window.history.replaceState({ usr: { notificationReturn: { path: '/home' } } }, '', '/chat/group/media');
  expect(returnFromNotificationChat(navigate)).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
});

it('returns a saved message to the saved list rather than accumulating focused chats', () => {
  const navigate = vi.fn() as unknown as NavigateFunction;
  window.history.replaceState({ idx: 5 }, '', '/saved?room=group');
  openNotificationChat(navigate, '/chat/group?at=saved');
  const origin = { path: '/saved?room=group', index: 5 };
  expect(navigate).toHaveBeenCalledWith('/chat/group?at=saved', { replace: false, state: { notificationReturn: origin } });
  window.history.replaceState({ idx: 6, usr: { notificationReturn: origin } }, '', '/chat/group?at=saved');
  returnFromNotificationChat(navigate);
  expect(navigate).toHaveBeenLastCalledWith(-1);
});
