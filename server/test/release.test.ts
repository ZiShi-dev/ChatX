import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'node:test';
import { createLimiter } from '../src/authService.ts';
import { loadConfig } from '../src/config.ts';
import { createApi } from '../src/http.ts';
import { createMemoryRepository } from '../src/memory.ts';
import { apkCanonical, sha256, signBytes, webCanonical } from '../src/releaseCrypto.ts';
import { readAppRelease, tryServeRelease } from '../src/releases.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });

function compact(value: string) {
  return value.replace(/\s/g, '');
}

function webRelease(dir: string, bytes: Buffer, nativeVersionCode = 2) {
  const checksum = sha256(bytes);
  const bundleId = `w${nativeVersionCode}-${checksum.slice(0, 12)}`;
  const path = `/app/releases/bundles/${bundleId}.zip`;
  mkdirSync(join(dir, 'bundles'), { recursive: true });
  writeFileSync(join(dir, 'bundles', `${bundleId}.zip`), bytes);
  const signature = signBytes(bytes, keys.privateKey);
  const described = { bundleId, checksum, nativeVersionCode, publishedAt: 1_700_000_000_000, path, signature };
  return { ...described, manifestSignature: signBytes(webCanonical(described), keys.privateKey) };
}

it('keeps the same update public key in the app, the server and Android', () => {
  const pem = readFileSync(join(root, 'update-public.pem'), 'utf8');
  const body = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----/g, '').replace(/\s/g, '');
  assert.match(body, /^[A-Za-z0-9+/=]{200,}$/);
  assert.ok(compact(readFileSync(join(root, 'src/lib/updatePublicKey.ts'), 'utf8')).includes(body));
  assert.ok(compact(readFileSync(join(root, 'capacitor.config.ts'), 'utf8')).includes(body));
  assert.ok(compact(readFileSync(join(root, 'android/app/src/main/res/values/update_key.xml'), 'utf8')).includes(body));
});

it('advertises a signed bundle and drops a modified file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chatx-release-'));
  try {
    const web = webRelease(dir, Buffer.from('interface'));
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ web, native: null }));
    assert.equal(readAppRelease(dir, keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()).web?.bundleId, web.bundleId);
    const file = join(dir, 'bundles', `${web.bundleId}.zip`);
    const bytes = readFileSync(file);
    bytes[0] = bytes[0] === 1 ? 2 : 1;
    writeFileSync(file, bytes);
    assert.equal(readAppRelease(dir, keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()).web, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('rejects an APK description signed by another key', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chatx-release-'));
  try {
    const bytes = Buffer.from('apk');
    const digest = sha256(bytes);
    const path = `/app/releases/apk/n3-${digest.slice(0, 12)}.apk`;
    mkdirSync(join(dir, 'apk'), { recursive: true });
    writeFileSync(join(dir, path.slice('/app/releases/'.length)), bytes);
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const signature = signBytes(bytes, other.privateKey);
    const described = { versionCode: 3, versionName: '1.2', sha256: digest, path, signature };
    const native = { ...described, manifestSignature: signBytes(apkCanonical(described), other.privateKey) };
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ web: null, native }));
    assert.equal(readAppRelease(dir, keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()).native, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('serves a release file and refuses to leave the release directory', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chatx-release-'));
  mkdirSync(join(dir, 'bundles'));
  writeFileSync(join(dir, 'bundles', 'w2-aaaaaaaaaaaa.zip'), Buffer.from('zip-bytes'));
  const server = createServer((req, res) => {
    if (!tryServeRelease(dir, req.url, req.method, res)) { res.statusCode = 404; res.end('outside'); }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('port');
  try {
    const file = await fetch(`http://127.0.0.1:${address.port}/app/releases/bundles/w2-aaaaaaaaaaaa.zip`);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'application/zip');
    assert.equal(await file.text(), 'zip-bytes');
    const escaped = await fetch(`http://127.0.0.1:${address.port}/app/releases/bundles/../../secret.zip`);
    assert.equal(escaped.status, 404);
    const encoded = await fetch(`http://127.0.0.1:${address.port}/app/releases/bundles/%2e%2e%2fsecret.zip`);
    assert.equal(encoded.status, 404);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('returns an empty catalog from the public release route', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chatx-release-'));
  try {
    writeFileSync(join(dir, 'manifest.json'), '{"web":null,"native":null}\n');
    const config = loadConfig({ DATABASE_URL: 'postgres://unused', CHATX_RELEASE_DIR: dir });
    const handle = createApi({ config, repo: createMemoryRepository(), now: () => 1_700_000_000_000, rateLimit: createLimiter(config, () => 1_700_000_000_000) });
    const response = await handle(new Request('http://127.0.0.1/api/app/release', { headers: { origin: 'https://localhost' } }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://localhost');
    assert.deepEqual(await response.json(), { web: null, native: null });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
