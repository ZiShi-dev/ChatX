import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PageNav from './PageNav';
import AccountTabs from '../account/AccountTabs';
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
const state = window.history.state;
afterEach(() => { cleanup(); navigate.mockClear(); window.history.replaceState(state, ''); });
it('replaces account tabs and ignores a tap on the active tab', () => {
  render(<AccountTabs active="profile" owner />);
  fireEvent.click(screen.getByRole('tab', { name: 'الملف الشخصي' }));
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('tab', { name: 'الإعدادات' }));
  expect(navigate).toHaveBeenCalledWith('/account?tab=settings', { replace: true });
  fireEvent.click(screen.getByRole('tab', { name: 'الإدارة' }));
  expect(navigate).toHaveBeenLastCalledWith('/admin', { replace: true });
});
it('replaces the fallback when opened directly without a router history index', () => {
  window.history.replaceState({}, '');
  render(<PageNav title="Profile" fallback="/home" />);
  fireEvent.click(screen.getByRole('button', { name: 'رجوع' }));
  expect(navigate).toHaveBeenCalledWith('/home', { replace: true });
});
it('uses actual back when an origin entry exists', () => {
  window.history.replaceState({ idx: 2 }, '');
  render(<PageNav title="Profile" fallback="/home" />);
  fireEvent.click(screen.getByRole('button', { name: 'رجوع' }));
  expect(navigate).toHaveBeenCalledWith(-1);
});
