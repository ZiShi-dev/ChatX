import { expect, test } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { apkCanonical, planRelease, readCatalog, signatureMatches, webCanonical } from './appRelease';

const checksum = 'a'.repeat(64);
const signature = 'A'.repeat(128);
const manifestSignature = 'B'.repeat(128);
const web = {
  bundleId: 'w2-aaaaaaaaaaaa',
  checksum,
  signature,
  manifestSignature,
  nativeVersionCode: 2,
  publishedAt: 1_700_000_000_000,
  path: '/app/releases/bundles/w2-aaaaaaaaaaaa.zip',
};
const native = {
  versionCode: 3,
  versionName: '1.2',
  sha256: checksum,
  signature,
  manifestSignature,
  path: '/app/releases/apk/n3-aaaaaaaaaaaa.apk',
};

function plan(overrides: Partial<Parameters<typeof planRelease>[0]> = {}) {
  return planRelease({
    catalog: { web, native },
    origin: 'https://chat.example',
    installedVersionCode: 2,
    blockedBundleIds: [],
    acceptedPublishedAt: 0,
    postponedVersionCode: 0,
    online: true,
    ...overrides,
  });
}

test('uses the same signed release description as the server', () => {
  expect(webCanonical(web)).toBe('chatx-web-v1\nw2-aaaaaaaaaaaa\n' + `${checksum}\n2\n1700000000000\n/app/releases/bundles/w2-aaaaaaaaaaaa.zip\n${signature}\n`);
  expect(apkCanonical(native)).toBe(`chatx-apk-v1\n3\n1.2\n${checksum}\n/app/releases/apk/n3-aaaaaaaaaaaa.apk\n${signature}\n`);
});

test('downloads a compatible interface bundle and asks before a newer APK', () => {
  const result = plan();
  expect(result.web).toMatchObject({ bundleId: web.bundleId, url: `https://chat.example${web.path}` });
  expect(result.native).toMatchObject({ versionCode: 3, url: `https://chat.example${native.path}` });
});

test('keeps the installed interface when the bundle, the network or the postponement does not match', () => {
  expect(plan({ catalog: { web: { ...web, nativeVersionCode: 9 }, native } }).web).toBeNull();
  expect(plan({ installedVersionCode: 4 }).web).toBeNull();
  expect(plan({ online: false }).web).toBeNull();
  expect(plan({ blockedBundleIds: [web.bundleId] }).web).toBeNull();
  expect(plan({ acceptedPublishedAt: web.publishedAt }).web).toBeNull();
  expect(plan({ postponedVersionCode: 3 }).native).toBeNull();
  expect(plan({ installedVersionCode: 3 }).native).toBeNull();
  expect(plan({ origin: 'http://chat.example' }).web).toBeNull();
});

test('drops a catalog entry that does not match its file name', () => {
  const catalog = readCatalog({ web: { ...web, path: '/app/releases/bundles/other.zip' }, native: { ...native, versionName: '../1' } });
  expect(catalog).toEqual({ web: null, native: null });
});

test('accepts a signature from the supplied key and rejects another key', async () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const message = webCanonical(web);
  const valid = sign('RSA-SHA256', Buffer.from(message), pair.privateKey).toString('base64');
  expect(await signatureMatches(message, valid, pem)).toBe(true);
  expect(await signatureMatches(message, valid)).toBe(false);
});
