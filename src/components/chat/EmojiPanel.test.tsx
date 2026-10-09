import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import EmojiPanel from './EmojiPanel';

afterEach(cleanup);
it('searches, picks repeatedly, keeps the popup open, and closes with Escape', () => {
  const pick = vi.fn(); const close = vi.fn(); render(<EmojiPanel onPick={pick} onClose={close} />);
  const search = screen.getByRole('searchbox');
  fireEvent.change(search, { target: { value: 'rire' } });
  expect(screen.getAllByRole('option')).toHaveLength(2);
  fireEvent.click(screen.getByRole('option', { name: '😂' }));
  fireEvent.click(screen.getByRole('option', { name: '😂' }));
  expect(pick).toHaveBeenCalledTimes(2);
  expect(close).not.toHaveBeenCalled();
  fireEvent.keyDown(search, { key: 'Escape' }); expect(search).toHaveValue('');
  fireEvent.keyDown(search, { key: 'Escape' }); expect(close).toHaveBeenCalledOnce();
});
it('restores category scroll and supports keyboard category navigation', () => {
  render(<EmojiPanel onPick={vi.fn()} />);
  fireEvent.click(screen.getByRole('tab', { name: 'وجوه' }));
  const grid = screen.getByRole('listbox'); grid.scrollTop = 90; fireEvent.scroll(grid);
  fireEvent.click(screen.getByRole('tab', { name: 'قلوب' })); expect(grid.scrollTop).toBe(0);
  fireEvent.click(screen.getByRole('tab', { name: 'وجوه' })); expect(grid.scrollTop).toBe(90);
  const faces = screen.getByRole('tab', { name: 'وجوه' }); faces.focus(); fireEvent.keyDown(faces, { key: 'End' });
  expect(screen.getByRole('tab', { name: 'رموز' })).toHaveAttribute('aria-selected', 'true');
});
it('limits broad search rendering and exposes additional results on demand', () => {
  render(<EmojiPanel onPick={vi.fn()} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'e' } });
  expect(screen.getAllByRole('option')).toHaveLength(120);
  fireEvent.click(screen.getByRole('button', { name: 'عرض المزيد' }));
  expect(screen.getAllByRole('option')).toHaveLength(240);
});
