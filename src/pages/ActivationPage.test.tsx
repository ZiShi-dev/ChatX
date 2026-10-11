import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useNetworkStore } from '../stores/networkStore';
import { useSettingsStore } from '../stores/settingsStore';

const finish = vi.hoisted(() => vi.fn());
const signIn = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());

vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector: (state: { signInWithGoogle: typeof signIn; finishGoogleProfile: typeof finish; currentUser: { color: string } }) => unknown) => selector({
    signInWithGoogle: signIn,
    finishGoogleProfile: finish,
    currentUser: { color: '#3d9b84' },
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

beforeEach(() => {
  cleanup();
  useSettingsStore.setState({ dataSaver: false });
  useNetworkStore.setState({ network: 'online' });
  finish.mockReset();
  signIn.mockReset();
  navigate.mockReset();
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test.apps.googleusercontent.com');
  window.google = {
    accounts: {
      id: {
        initialize: ({ callback }) => { callback({ credential: 'token' }); },
        renderButton: () => undefined,
        cancel: () => undefined,
      },
    },
  };
});

afterEach(() => {
  cleanup();
  useSettingsStore.setState({ dataSaver: true });
  vi.unstubAllEnvs();
  delete window.google;
});

test('walks through name, appearance and effect before creating the account', async () => {
  signIn.mockResolvedValue({ ok: true, step: 'profile', name: 'نورة', picture: 'https://lh3.googleusercontent.com/a/photo' });
  finish.mockResolvedValue('ok');
  const { default: ActivationPage } = await import('./ActivationPage');
  render(<ActivationPage />);
  expect(await screen.findByText('صورة Google للمعاينة فقط. لحفظ صورة في ChatX، اختر واحدة من جهازك.')).toBeInTheDocument();
  expect(document.querySelector('.account-setup-pane.is-motion')).not.toBeNull();
  fireEvent.change(screen.getByRole('textbox', { name: 'الاسم' }), { target: { value: 'ل' } });
  fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
  expect(screen.getByRole('alert')).toHaveTextContent('الاسم يحتاج حرفين على الأقل.');
  fireEvent.change(screen.getByRole('textbox', { name: 'الاسم' }), { target: { value: 'ليلى' } });
  fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
  expect(screen.getByRole('heading', { name: 'مظهر الاسم' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: '#4d7ea8' }));
  fireEvent.click(screen.getByRole('option', { name: 'واضح' }));
  fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
  expect(screen.getByRole('heading', { name: 'الزينة' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /التنين$/ }));
  fireEvent.click(screen.getByRole('button', { name: 'تساقط البتلات' }));
  fireEvent.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));
  expect(await screen.findByRole('button', { name: 'إنشاء الحساب' })).toBeEnabled();
  expect(finish).toHaveBeenCalledWith('token', 'ليلى', {
    color: '#4d7ea8',
    messageFont: 'clear',
    avatarDecoration: 'dragon',
    profileEffect: 'jade-petals',
  });
  expect(navigate).toHaveBeenCalledWith('/home', { replace: true });
}, 15000);

test('keeps the first profile still while data saving is on', async () => {
  useSettingsStore.setState({ dataSaver: true });
  signIn.mockResolvedValue({ ok: true, step: 'profile', name: 'نورة', picture: 'https://lh3.googleusercontent.com/a/photo' });
  const { default: ActivationPage } = await import('./ActivationPage');
  render(<ActivationPage />);
  expect(await screen.findByText('وضع التوفير لا يجلب صورة Google. يمكنك اختيار صورة من جهازك.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
  expect(document.querySelector('.account-setup-pane.is-motion')).toBeNull();
  expect(document.querySelector('.is-animated')).toBeNull();
}, 15000);

test('returns to the name when it is already used', async () => {
  signIn.mockResolvedValue({ ok: true, step: 'profile', name: 'نورة', picture: '' });
  finish.mockResolvedValue('username_taken');
  const { default: ActivationPage } = await import('./ActivationPage');
  render(<ActivationPage />);
  expect(await screen.findByRole('textbox', { name: 'الاسم' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
  fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
  fireEvent.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('هذا الاسم مستخدم. اختر اسمًا آخر.');
  expect(screen.getByRole('heading', { name: 'حسابك' })).toBeInTheDocument();
  expect(navigate).not.toHaveBeenCalled();
}, 15000);
