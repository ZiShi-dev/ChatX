import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'releases/manifest.json'), 'utf8'));
const target = join(root, 'server/releases');
mkdirSync(target, { recursive: true });
for (const entry of [manifest.native, manifest.web]) {
  if (!entry) continue;
  const match = /^\/app\/releases\/(apk|bundles)\/([A-Za-z0-9_-]+\.(?:apk|zip))$/.exec(entry.path);
  if (!match) throw new Error('Chemin de publication invalide');
  mkdirSync(join(target, match[1]), { recursive: true });
  copyFileSync(join(root, 'releases', match[1], match[2]), join(target, match[1], match[2]));
}
copyFileSync(join(root, 'update-public.pem'), join(root, 'server/update-public.pem'));
writeFileSync(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Manifeste signé et fichiers APK/interface intégrés au contexte Docker serveur.');
