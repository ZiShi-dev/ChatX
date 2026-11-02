import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function run(command, cwd = root) {
  const result = spawnSync(command, { cwd, shell: true, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`Échec : ${command}`);
}

function envValue(name) {
  const path = resolve(root, '.env');
  if (!existsSync(path)) return '';
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const mark = trimmed.indexOf('=');
    if (mark < 0 || trimmed.slice(0, mark).trim() !== name) continue;
    let value = trimmed.slice(mark + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return value;
  }
  return '';
}

const origin = envValue('VITE_API_ORIGIN').replace(/\/$/, '');
if (!/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(origin)) {
  throw new Error('VITE_API_ORIGIN doit être une origine https:// avant un bundle Play.');
}
if (!existsSync(resolve(root, 'android', 'app', 'google-services.json'))) {
  throw new Error('android/app/google-services.json est absent. Les notifications push ne seront pas dans le bundle.');
}

run('node scripts/ensure-upload-keystore.mjs');
run('npm run build');
run('npx cap sync android');
run(process.platform === 'win32' ? 'gradlew.bat :app:bundleRelease' : './gradlew :app:bundleRelease', resolve(root, 'android'));

const bundle = resolve(root, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
if (!existsSync(bundle)) throw new Error('Le bundle release est introuvable.');
const version = JSON.parse(readFileSync(resolve(root, 'app-version.json'), 'utf8'));
console.log(`Bundle Play prêt : ${bundle}`);
console.log(`versionName ${version.versionName}, versionCode ${version.versionCode}. Augmente versionCode avant chaque nouvel envoi.`);
