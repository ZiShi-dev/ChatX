import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const pg = (await import(pathToFileURL(join(root, 'server', 'node_modules', 'pg', 'lib', 'index.js')).href)).default;
const serverDir = join(root, 'server');

function mask(value, keep = 6) {
  const text = String(value ?? '').trim();
  if (!text) return '(vide)';
  if (text.length <= keep * 2) return '***';
  return `${text.slice(0, keep)}…${text.slice(-keep)}`;
}

function ok(label, detail = 'ok') {
  console.log(`OK  ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail) {
  console.log(`KO  ${label} — ${detail}`);
}

const checks = [];

function requireEnv(name) {
  const value = process.env[name]?.trim() ?? '';
  if (!value) {
    checks.push(false);
    fail(name, 'manquant ou vide');
    return '';
  }
  checks.push(true);
  ok(name, mask(value));
  return value;
}

console.log('=== Variables .env (présence) ===\n');

requireEnv('POSTGRES_PASSWORD');
const databaseUrl = requireEnv('DATABASE_URL');
requireEnv('PORT');
requireEnv('CHATX_TRUST_PROXY');
const tlsCert = requireEnv('CHATX_TLS_CERT');
const tlsKey = requireEnv('CHATX_TLS_KEY');
requireEnv('CHATX_TLS_PORT');
requireEnv('VITE_API_ORIGIN');
requireEnv('VITE_GOOGLE_CLIENT_ID');
const fcmBuild = process.env.VITE_ENABLE_FCM?.trim();
if (fcmBuild === 'true') ok('VITE_ENABLE_FCM', 'true');
else {
  checks.push(false);
  fail('VITE_ENABLE_FCM', `attendu "true", reçu "${fcmBuild ?? ''}"`);
}
const googleId = requireEnv('GOOGLE_CLIENT_ID');
const viteGoogle = process.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';
if (viteGoogle && googleId && viteGoogle !== googleId) {
  checks.push(false);
  fail('GOOGLE_CLIENT_ID / VITE_GOOGLE_CLIENT_ID', 'doivent être identiques');
} else if (viteGoogle && googleId) {
  ok('GOOGLE_CLIENT_ID = VITE_GOOGLE_CLIENT_ID', 'cohérent');
}

const firebaseProject = requireEnv('FIREBASE_PROJECT_ID');
const firebaseEmail = requireEnv('FIREBASE_CLIENT_EMAIL');
const firebaseKeyRaw = requireEnv('FIREBASE_PRIVATE_KEY');
const firebaseKey = firebaseKeyRaw.replace(/\\n/g, '\n').trim();
if (firebaseKey && !firebaseKey.includes('BEGIN PRIVATE KEY')) {
  checks.push(false);
  fail('FIREBASE_PRIVATE_KEY', 'format PEM invalide (BEGIN PRIVATE KEY manquant)');
} else if (firebaseKey) {
  ok('FIREBASE_PRIVATE_KEY', 'format PEM');
}

console.log('\n=== Fichiers ===\n');

const gs = join(root, 'android', 'app', 'google-services.json');
if (existsSync(gs)) {
  try {
    const json = JSON.parse(readFileSync(gs, 'utf8'));
    const pkg = json.client?.[0]?.client_info?.android_client_info?.package_name;
    const projectId = json.project_info?.project_id;
    if (pkg === 'app.chatx.mobile') ok('google-services.json', `package ${pkg}`);
    else {
      checks.push(false);
      fail('google-services.json', `package ${pkg ?? '?'} ≠ app.chatx.mobile`);
    }
    if (projectId && firebaseProject && projectId !== firebaseProject) {
      checks.push(false);
      fail('FIREBASE_PROJECT_ID', `≠ project_id du JSON (${projectId})`);
    } else if (projectId) {
      ok('FIREBASE_PROJECT_ID = google-services.json', projectId);
    }
  } catch (error) {
    checks.push(false);
    fail('google-services.json', error instanceof Error ? error.message : 'parse error');
  }
} else {
  checks.push(false);
  fail('google-services.json', 'absent de android/app/');
}

const certPath = join(serverDir, tlsCert);
const keyPath = join(serverDir, tlsKey);
if (existsSync(certPath) && existsSync(keyPath)) ok('CHATX_TLS_CERT / KEY', 'fichiers présents');
else {
  checks.push(false);
  fail('CHATX_TLS', `cert=${existsSync(certPath)} key=${existsSync(keyPath)}`);
}

console.log('\n=== Connexion PostgreSQL ===\n');

if (databaseUrl) {
  const pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  try {
    const result = await pool.query('SELECT 1 AS ok');
    if (result.rows[0]?.ok === 1) ok('DATABASE_URL', 'connexion réussie');
    else {
      checks.push(false);
      fail('DATABASE_URL', 'réponse inattendue');
    }
  } catch (error) {
    checks.push(false);
    fail('DATABASE_URL', error instanceof Error ? error.message : 'échec');
  } finally {
    await pool.end().catch(() => undefined);
  }
}

console.log('\n=== Firebase (jeton OAuth FCM) ===\n');

if (firebaseProject && firebaseEmail && firebaseKey.includes('BEGIN')) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claim = Buffer.from(JSON.stringify({
    iss: firebaseEmail,
    sub: firebaseEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })).toString('base64url');
  const unsigned = `${header}.${claim}`;
  const { createSign } = await import('node:crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  sign.end();
  let signature;
  try {
    signature = sign.sign(firebaseKey).toString('base64url');
  } catch (error) {
    checks.push(false);
    fail('FIREBASE_PRIVATE_KEY', 'signature RSA impossible (clé invalide)');
    signature = '';
  }
  if (signature) {
    const assertion = `${unsigned}.${signature}`;
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (response.ok) ok('Firebase OAuth', 'jeton obtenu (FCM prêt côté serveur)');
    else {
      checks.push(false);
      const body = await response.text();
      fail('Firebase OAuth', `${response.status} ${body.slice(0, 120)}`);
    }
  }
} else {
  checks.push(false);
  fail('Firebase OAuth', 'variables FIREBASE_* incomplètes — test ignoré');
}

console.log('\n=== Résumé ===\n');
const passed = checks.filter(Boolean).length;
const total = checks.length;
if (passed === total) {
  console.log(`Tout est bon (${passed}/${total} contrôles).`);
  process.exit(0);
}
console.log(`${passed}/${total} contrôles OK — corrige les lignes KO ci-dessus.`);
process.exit(1);
