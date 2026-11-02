import { vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as appRelease from '../../lib/appRelease';
import AppReleasePrompt from './AppReleasePrompt';

const offer = {
  versionCode: 3,
  versionName: '1.2',
  url: 'https://chat.example/app/releases/apk/n3-aaaaaaaaaaaa.apk',
  sha256: 'a'.repeat(64),
  signature: 'A'.repeat(128),
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('asks before opening the Play Store and can wait', () => {
  const install = vi.spyOn(appRelease, 'installNativeRelease').mockResolvedValue(undefined);
  const postpone = vi.spyOn(appRelease, 'postponeApk').mockImplementation(() => undefined);
  vi.spyOn(appRelease, 'startAppUpdates').mockImplementation((onNative) => {
    onNative(offer);
    return () => undefined;
  });
  render(<AppReleasePrompt />);
  expect(screen.getByRole('alertdialog')).toHaveTextContent('يتوفر الإصدار 1.2');
  fireEvent.click(screen.getByRole('button', { name: 'ليس الآن' }));
  expect(postpone).toHaveBeenCalledWith(3);
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(install).not.toHaveBeenCalled();
});

test('shows a failure without replacing the installed copy', async () => {
  vi.spyOn(appRelease, 'installNativeRelease').mockRejectedValue(new Error('unavailable'));
  vi.spyOn(appRelease, 'startAppUpdates').mockImplementation((onNative) => {
    onNative(offer);
    return () => undefined;
  });
  render(<AppReleasePrompt />);
  fireEvent.click(screen.getByRole('button', { name: 'فتح المتجر' }));
  expect(await screen.findByText('تعذر فتح متجر Play. تبقى النسخة الحالية.')).toBeInTheDocument();
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
});
