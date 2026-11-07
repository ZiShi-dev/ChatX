import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import * as appRelease from '../../lib/appRelease';
import { AppRelease } from '../../lib/appReleasePlugin';
import ApkUpdateCard from './ApkUpdateCard';

const offer = {
  versionCode: 21,
  versionName: '1.1',
  url: 'https://chat.example/app/releases/apk/n21-aaaaaaaaaaaa.apk',
  sha256: 'a'.repeat(64),
  signature: 'A'.repeat(128),
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('shows a clear check button in settings', () => {
  render(<ApkUpdateCard />);
  expect(screen.getByRole('button', { name: 'التحقق من التحديث' })).toBeEnabled();
});

test('says the installed copy is already current', async () => {
  vi.spyOn(appRelease, 'lookupNativeUpdate').mockResolvedValue({ kind: 'current' });
  const install = vi.spyOn(appRelease, 'installNativeRelease');
  render(<ApkUpdateCard />);
  fireEvent.click(screen.getByRole('button', { name: 'التحقق من التحديث' }));
  expect(await screen.findByRole('status')).toHaveTextContent('لديك آخر إصدار.');
  expect(install).not.toHaveBeenCalled();
});

test('starts the install when a newer signed release exists', async () => {
  vi.spyOn(appRelease, 'lookupNativeUpdate').mockResolvedValue({ kind: 'offer', offer });
  vi.spyOn(AppRelease, 'installedFromPlay').mockResolvedValue({ play: false });
  const install = vi.spyOn(appRelease, 'installNativeRelease').mockResolvedValue(undefined);
  render(<ApkUpdateCard />);
  fireEvent.click(screen.getByRole('button', { name: 'التحقق من التحديث' }));
  await waitFor(() => expect(install).toHaveBeenCalledWith(offer));
  expect(await screen.findByRole('status')).toHaveTextContent('أكد التثبيت');
});

test('keeps the current copy when the check fails', async () => {
  vi.spyOn(appRelease, 'lookupNativeUpdate').mockResolvedValue({ kind: 'failed' });
  const install = vi.spyOn(appRelease, 'installNativeRelease');
  render(<ApkUpdateCard />);
  fireEvent.click(screen.getByRole('button', { name: 'التحقق من التحديث' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('تعذر التحقق');
  expect(install).not.toHaveBeenCalled();
});
