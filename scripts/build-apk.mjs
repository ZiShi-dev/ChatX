import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function run(command, cwd = root) {
  const result = spawnSync(command, { cwd, shell: true, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('Construction interrompue : aucun nouvel APK publié.');
}
const path = resolve(root, 'app-version.json');
const version = JSON.parse(readFileSync(path, 'utf8'));
version.versionCode += 1;
if (!Number.isSafeInteger(version.versionCode) || version.versionCode > 1_000_000) throw new Error('Version invalide');
writeFileSync(path, `${JSON.stringify(version, null, 2)}\n`);
run('npm run build');
run('npx cap sync android');
run(process.platform === 'win32' ? 'gradlew.bat :app:assembleDebug' : './gradlew :app:assembleDebug', resolve(root, 'android'));
run('node scripts/publish-release.mjs apk android/app/build/outputs/apk/debug/app-debug.apk');
console.log('APK signé prêt dans releases/. Inclure app-version.json et releases/ dans le commit/push pour le déploiement VPS.');
