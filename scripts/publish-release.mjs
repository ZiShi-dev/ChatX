import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apkCanonical, sha256, signBytes, webCanonical } from '../server/src/releaseCrypto.ts';
import { zipDirectory } from './zipDirectory.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = join(root, 'releases');
const keyPath = process.env.CHATX_UPDATE_PRIVATE_KEY?.trim() || join(root, 'server', 'certs', 'update-private.pem');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readManifest() {
  try {
    const parsed = JSON.parse(readFileSync(join(releaseDir, 'manifest.json'), 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { web: null, native: null };
    return { web: parsed.web ?? null, native: parsed.native ?? null };
  } catch {
    return { web: null, native: null };
  }
}

function writeManifest(manifest) {
  mkdirSync(releaseDir, { recursive: true });
  writeFileSync(join(releaseDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

const privateKey = (() => {
  try { return readFileSync(keyPath, 'utf8'); } catch { return ''; }
})();
if (!privateKey.includes('PRIVATE KEY')) fail('Clé privée introuvable. Conserve server/certs/update-private.pem hors de Git.');

const version = JSON.parse(readFileSync(join(root, 'app-version.json'), 'utf8'));
const kind = process.argv[2];
const manifest = readManifest();

if (kind === 'web') {
  const source = join(root, 'dist');
  try { readFileSync(join(source, 'index.html')); } catch { fail('dist/index.html est absent. Lance d’abord la compilation.'); }
  const zip = zipDirectory(source);
  if (zip.length > 32 * 1024 * 1024) fail('Le paquet d’interface dépasse 32 Mo.');
  const checksum = sha256(zip);
  const bundleId = `w${version.versionCode}-${checksum.slice(0, 12)}`;
  const path = `/app/releases/bundles/${bundleId}.zip`;
  const signature = signBytes(zip, privateKey);
  const described = {
    bundleId,
    checksum,
    signature,
    nativeVersionCode: version.versionCode,
    publishedAt: Date.now(),
    path,
  };
  described.manifestSignature = signBytes(webCanonical(described), privateKey);
  mkdirSync(join(releaseDir, 'bundles'), { recursive: true });
  writeFileSync(join(releaseDir, 'bundles', `${bundleId}.zip`), zip);
  manifest.web = described;
  writeManifest(manifest);
  console.log(`Interface signée : ${bundleId}`);
} else if (kind === 'apk') {
  const source = process.argv[3] ? resolve(process.argv[3]) : '';
  if (!source) fail('Indique le fichier APK : node scripts/publish-release.mjs apk chemin/app.apk');
  const bytes = readFileSync(source);
  if (bytes.length > 80 * 1024 * 1024) fail('L’APK dépasse 80 Mo.');
  const digest = sha256(bytes);
  const fileName = `n${version.versionCode}-${digest.slice(0, 12)}.apk`;
  const path = `/app/releases/apk/${fileName}`;
  const signature = signBytes(bytes, privateKey);
  const described = {
    versionCode: version.versionCode,
    versionName: String(version.versionName),
    sha256: digest,
    signature,
    path,
  };
  described.manifestSignature = signBytes(apkCanonical(described), privateKey);
  mkdirSync(join(releaseDir, 'apk'), { recursive: true });
  copyFileSync(source, join(releaseDir, 'apk', fileName));
  manifest.native = described;
  writeManifest(manifest);
  console.log(`APK signé : ${fileName}`);
} else {
  fail('Utilise web ou apk.');
}
