import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MessageActionBar from './MessageActionBar';
vi.mock('../../lib/overlayBack', () => ({ useOverlayHistory: vi.fn(), dismissOverlayHistory: vi.fn(), registerOverlayClose: () => () => {} }));
afterEach(cleanup);
it('keeps primary actions in the navigation and reveals other actions only on request', () => {
  const reply = vi.fn();
  render(<MessageActionBar onClose={vi.fn()}>
    <div role="group" aria-label="تفاعل">😀</div>
    <button role="menuitem" onClick={reply}><span>رد</span></button>
    <button role="menuitem"><span>معلومات</span></button>
  </MessageActionBar>);
  expect(screen.getByRole('toolbar')).toBeTruthy();
  expect(screen.queryByText('معلومات')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'رد' }));
  expect(reply).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'المزيد من الإجراءات' }));
  expect(screen.getByRole('menuitem', { name: 'معلومات' })).toBeTruthy();
});
it('closes selection on Escape, outside touch and selecting another message', () => {
  const close = vi.fn();
  render(<MessageActionBar onClose={close}><button role="menuitem"><span>رد</span></button></MessageActionBar>);
  fireEvent.keyDown(document, { key: 'Escape' });
  fireEvent.pointerDown(document.body);
  window.dispatchEvent(new Event('chatx-message-selection'));
  expect(close).toHaveBeenCalledTimes(3);
});
