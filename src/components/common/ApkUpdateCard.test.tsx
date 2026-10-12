import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ApkUpdateCard from './ApkUpdateCard';
const mocks = vi.hoisted(() => ({ install: vi.fn(), verify: vi.fn(), native: null as null | Record<string, unknown> }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' } }));
vi.mock('@capacitor/app', () => ({ App: { getInfo: async () => ({ build: '2' }) } }));
vi.mock('../../lib/apiOrigin', () => ({ getApiOrigin: () => 'https://example.com' }));
vi.mock('../../lib/appRelease', () => ({ apkCanonical: () => 'signed', signatureMatches: mocks.verify, readCatalog: () => ({ native: mocks.native }), installNativeRelease: mocks.install }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.native = { versionCode: 3, path: '/app/releases/apk/test.apk', manifestSignature: 'signature' };
  mocks.verify.mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function click() { render(<ApkUpdateCard />); fireEvent.click(screen.getByRole('button')); }
it('installs a newer verified release from the VPS', async () => {
  click();
  await waitFor(() => expect(mocks.install).toHaveBeenCalledWith(expect.objectContaining({ versionCode: 3, url: 'https://example.com/app/releases/apk/test.apk' })));
});
it('does not install a release with an invalid signature', async () => {
  mocks.verify.mockResolvedValue(false);
  click();
  await screen.findByRole('alert');
  expect(mocks.install).not.toHaveBeenCalled();
});
it('does not reinstall the current version', async () => {
  mocks.native!.versionCode = 2;
  click();
  await screen.findByText('لديك آخر إصدار من التطبيق.');
  expect(mocks.install).not.toHaveBeenCalled();
});
