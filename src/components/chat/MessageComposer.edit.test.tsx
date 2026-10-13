import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Keyboard } from '@capacitor/keyboard';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import type { Message } from '../../types/message';

vi.mock('@capacitor/keyboard', () => ({ Keyboard: { show: vi.fn(async () => undefined) } }));
vi.mock('@capacitor/core', async importOriginal => {
  const actual = await importOriginal<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, getPlatform: () => 'android', isNativePlatform: () => false } };
});
vi.mock('../../lib/overlayBack', () => ({ useOverlayHistory: vi.fn(), dismissOverlayHistory: vi.fn(), registerOverlayClose: () => () => {} }));

const original = useChatStore.getState();
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLTextAreaElement) {
    return 22 + this.value.split('\n').length * 22;
  });
});
afterEach(() => { cleanup(); useChatStore.setState(original); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('loads a multiline edit, sizes the field and opens the keyboard from the navigation action', () => {
  const message: Message = { id: 'edit-layout', conversationId: 'edit-room', senderId: useAuthStore.getState().currentUser.id, type: 'text', text: 'Première ligne\nDeuxième ligne\nTroisième ligne', status: 'sent', createdAt: new Date().toISOString() };
  useChatStore.setState({ messages: [message], editingId: null, messageActionOpenId: null, replyingTo: null });
  const beginEdit = vi.fn(original.beginEdit);
  useChatStore.setState({ beginEdit });
  render(createElement('ion-page', null, <MessageBubble message={message} mine showAuthor={false} />, <MessageComposer conversationId="edit-room" />));
  act(() => useChatStore.getState().requestMessageActions(message.id));
  expect(useChatStore.getState().messages.find(item => item.id === message.id)?.senderId).toBe(useAuthStore.getState().currentUser.id);
  fireEvent.click(screen.getByRole('button', { name: 'تعديل' }));
  expect(beginEdit).toHaveBeenCalledWith(message.id);
  expect(useChatStore.getState().editingId).toBe(message.id);
  const field = screen.getByPlaceholderText('اكتب رسالة') as HTMLTextAreaElement;
  expect(field.value).toBe(message.text);
  expect(field.style.height).toBe('88px');
  expect(document.activeElement).toBe(field);
  expect(field.selectionStart).toBe(field.value.length);
  expect(Keyboard.show).toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'مرفق' })).toBeNull();
  fireEvent.change(field, { target: { value: 'One line' } });
  expect(field.style.height).toBe('44px');
  fireEvent.change(field, { target: { value: 'Line\n'.repeat(12) } });
  expect(field.style.height).toBe('120px');
});
