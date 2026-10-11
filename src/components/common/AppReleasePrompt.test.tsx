import { vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AppReleasePrompt from './AppReleasePrompt';

const install = vi.hoisted(() => vi.fn<() => Promise<void>>());
const postpone = vi.hoisted(() => vi.fn());

vi.mock('../../lib/appRelease', () => ({
  startAppUpdates: (onNative: (offer: { versionCode: number; versionName: string; url: string; sha256: string; signature: string }) => void) => {
    onNative({
      versionCode: 3,
      versionName: '1.2',
      url: 'https://chat.example/app/releases/apk/n3-aaaaaaaaaaaa.apk',
      sha256: 'a'.repeat(64),
      signature: 'A'.repeat(128),
    });
    return () => undefined;
  },
  postponeApk: (versionCode: number) => postpone(versionCode),
  installNativeRelease: () => install(),
  installFailureMessage: () => 'تعذر تثبيت التحديث. تبقى النسخة الحالية.',
}));

afterEach(() => { cleanup(); install.mockReset(); postpone.mockReset(); });

test('asks before installing a newer APK and can wait', () => {
  install.mockResolvedValue(undefined);
  render(<AppReleasePrompt />);
  expect(screen.getByRole('alertdialog')).toHaveTextContent('يتوفر الإصدار 1.2');
  fireEvent.click(screen.getByRole('button', { name: 'ليس الآن' }));
  expect(postpone).toHaveBeenCalledWith(3);
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('shows a failure without replacing the installed copy', async () => {
  install.mockRejectedValue(new Error('download_failed'));
  render(<AppReleasePrompt />);
  fireEvent.click(screen.getByRole('button', { name: 'تثبيت' }));
  expect(await screen.findByText('تعذر تثبيت التحديث. تبقى النسخة الحالية.')).toBeInTheDocument();
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
});
