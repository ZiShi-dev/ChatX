import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = join(root, 'android');
const propertiesPath = join(androidDir, 'keystore.properties');
const keystorePath = join(androidDir, 'app', 'chatx-upload.jks');
const alias = 'chatx';

function keytoolPath() {
  const home = process.env.JAVA_HOME;
  if (home) {
    const name = process.platform === 'win32' ? 'keytool.exe' : 'keytool';
    const candidate = join(home, 'bin', name);
    if (existsSync(candidate)) return candidate;
  }
  return process.platform === 'win32' ? 'keytool.exe' : 'keytool';
}

if (existsSync(propertiesPath) && existsSync(keystorePath)) {
  console.log('Clé de téléversement déjà présente (android/keystore.properties).');
  process.exit(0);
}
if (existsSync(propertiesPath) !== existsSync(keystorePath)) {
  console.error('La clé et android/keystore.properties doivent être présents ensemble. Aucun fichier n’a été écrasé.');
  process.exit(1);
}

const password = randomBytes(24).toString('base64url');
mkdirSync(dirname(keystorePath), { recursive: true });
const result = spawnSync(keytoolPath(), [
  '-genkeypair',
  '-v',
  '-keystore', keystorePath,
  '-alias', alias,
  '-keyalg', 'RSA',
  '-keysize', '2048',
  '-validity', '10000',
  '-storepass', password,
  '-keypass', password,
  '-dname', 'CN=ChatX, OU=Mobile, O=ChatX, C=FR',
], { stdio: 'inherit' });

if (result.error || result.status !== 0) {
  if (existsSync(keystorePath)) unlinkSync(keystorePath);
  console.error('keytool a échoué. Installe un JDK 21 et définis JAVA_HOME, puis relance npm run play:bundle.');
  process.exit(result.status || 1);
}

const written = readFileSync(keystorePath);
if (written.length < 100) {
  unlinkSync(keystorePath);
  console.error('Le keystore généré est vide.');
  process.exit(1);
}

writeFileSync(propertiesPath, [
  'storeFile=app/chatx-upload.jks',
  `storePassword=${password}`,
  `keyAlias=${alias}`,
  `keyPassword=${password}`,
  '',
].join('\n'));
console.log('Clé de téléversement créée. Conserve android/app/chatx-upload.jks et android/keystore.properties hors du dépôt : sans eux, Play ne pourra plus mettre à jour ChatX.');
