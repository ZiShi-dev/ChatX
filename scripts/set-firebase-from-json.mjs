import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const jsonPath = resolve(process.argv[2] ?? '');
if (!jsonPath || process.argv.length < 3) {
  console.error('Usage: node scripts/set-firebase-from-json.mjs <chemin-vers-compte-service.json>');
  process.exit(1);
}

const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
const projectId = String(data.project_id ?? '').trim();
const email = String(data.client_email ?? '').trim();
const key = String(data.private_key ?? '').trim();
if (!projectId || !email || !key.includes('BEGIN PRIVATE KEY')) {
  console.error('JSON invalide : project_id, client_email ou private_key manquant.');
  process.exit(1);
}

const envPath = resolve(import.meta.dirname, '..', '.env');
let env = readFileSync(envPath, 'utf8');
const escapedKey = key.replace(/\n/g, '\\n').replace(/"/g, '\\"');
const set = (name, value) => {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  env = pattern.test(env) ? env.replace(pattern, line) : `${env.replace(/\s*$/, '')}\n${line}\n`;
};
set('FIREBASE_PROJECT_ID', projectId);
set('FIREBASE_CLIENT_EMAIL', email);
set('FIREBASE_PRIVATE_KEY', `"${escapedKey}"`);

writeFileSync(envPath, env.endsWith('\n') ? env : `${env}\n`, 'utf8');
console.log('OK — .env mis à jour :');
console.log(`  FIREBASE_PROJECT_ID=${projectId}`);
console.log(`  FIREBASE_CLIENT_EMAIL=${email}`);
console.log(`  FIREBASE_PRIVATE_KEY=(PEM ${key.length} caractères, une ligne avec \\n)`);
