import { createReadStream, readFileSync, realpathSync, statSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apkCanonical, sha256, verifyBytes, webCanonical } from './releaseCrypto.ts';

const WEB_LIMIT = 32 * 1024 * 1024;
const APK_LIMIT = 80 * 1024 * 1024;
const hashes = new Map<string, { mtimeMs: number; size: number; sha256: string }>();

export type WebRelease = {
  bundleId: string;
  checksum: string;
  signature: string;
  manifestSignature: string;
  nativeVersionCode: number;
  publishedAt: number;
  path: string;
};

export type NativeRelease = {
  versionCode: number;
  versionName: string;
  sha256: string;
  signature: string;
  manifestSignature: string;
  path: string;
};

export type AppRelease = { web: WebRelease | null; native: NativeRelease | null };

const HEX = /^[a-f0-9]{64}$/;
const SIGNATURE = /^[A-Za-z0-9+/]+=*$/;
const VERSION_NAME = /^[0-9]+(?:\.[0-9]+){1,2}$/;

export function bundledUpdatePublicKey() {
  try {
    return readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'update-public.pem'), 'utf8');
  } catch {
    return '';
  }
}

function versionCode(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1_000_000 ? value : 0;
}

function publishedAt(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1_700_000_000_000 && value <= 4_000_000_000_000 ? value : 0;
}

function signature(value: unknown) {
  return typeof value === 'string' && value.length >= 64 && value.length <= 1024 && SIGNATURE.test(value) ? value : '';
}

function fileHash(path: string, size: number, mtimeMs: number) {
  const cached = hashes.get(path);
  if (cached && cached.size === size && cached.mtimeMs === mtimeMs) return cached.sha256;
  const digest = sha256(readFileSync(path));
  hashes.set(path, { mtimeMs, size, sha256: digest });
  return digest;
}

function inside(root: string, file: string) {
  const base = realpathSync(root);
  const target = realpathSync(file);
  return target === base || target.startsWith(base + sep);
}

function readReleaseFile(dir: string, relativePath: string, limit: number) {
  const full = resolve(dir, relativePath);
  if (!full.startsWith(resolve(dir) + sep)) return null;
  try {
    const info = statSync(full);
    if (!info.isFile() || info.size <= 0 || info.size > limit || !inside(dir, full)) return null;
    return { path: full, size: info.size, sha256: fileHash(full, info.size, info.mtimeMs) };
  } catch {
    return null;
  }
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function validWeb(dir: string, publicKey: string, value: unknown): WebRelease | null {
  const row = asRecord(value);
  if (!row) return null;
  const nativeVersionCode = versionCode(row.nativeVersionCode);
  const published = publishedAt(row.publishedAt);
  const checksum = typeof row.checksum === 'string' && HEX.test(row.checksum) ? row.checksum : '';
  const fileSignature = signature(row.signature);
  const manifestSignature = signature(row.manifestSignature);
  const bundleId = typeof row.bundleId === 'string' ? row.bundleId : '';
  const path = typeof row.path === 'string' ? row.path : '';
  if (!nativeVersionCode || !published || !checksum || !fileSignature || !manifestSignature) return null;
  if (bundleId !== `w${nativeVersionCode}-${checksum.slice(0, 12)}`) return null;
  if (path !== `/app/releases/bundles/${bundleId}.zip`) return null;
  const file = readReleaseFile(dir, `bundles/${bundleId}.zip`, WEB_LIMIT);
  if (!file || file.sha256 !== checksum) return null;
  const described = { bundleId, checksum, nativeVersionCode, publishedAt: published, path, signature: fileSignature };
  if (!verifyBytes(readFileSync(file.path), fileSignature, publicKey)) return null;
  if (!verifyBytes(webCanonical(described), manifestSignature, publicKey)) return null;
  return { ...described, manifestSignature };
}

function validNative(dir: string, publicKey: string, value: unknown): NativeRelease | null {
  const row = asRecord(value);
  if (!row) return null;
  const version = versionCode(row.versionCode);
  const versionName = typeof row.versionName === 'string' && VERSION_NAME.test(row.versionName) ? row.versionName : '';
  const digest = typeof row.sha256 === 'string' && HEX.test(row.sha256) ? row.sha256 : '';
  const fileSignature = signature(row.signature);
  const manifestSignature = signature(row.manifestSignature);
  const path = typeof row.path === 'string' ? row.path : '';
  const fileName = `n${version}-${digest.slice(0, 12)}.apk`;
  if (!version || !versionName || !digest || !fileSignature || !manifestSignature) return null;
  if (path !== `/app/releases/apk/${fileName}`) return null;
  const file = readReleaseFile(dir, `apk/${fileName}`, APK_LIMIT);
  if (!file || file.sha256 !== digest) return null;
  const described = { versionCode: version, versionName, sha256: digest, path, signature: fileSignature };
  if (!verifyBytes(readFileSync(file.path), fileSignature, publicKey)) return null;
  if (!verifyBytes(apkCanonical(described), manifestSignature, publicKey)) return null;
  return { ...described, manifestSignature };
}

export function readAppRelease(dir: string, publicKeyPem: string): AppRelease {
  if (!dir || !publicKeyPem.trim()) return { web: null, native: null };
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    const row = asRecord(parsed);
    if (!row) return { web: null, native: null };
    return {
      web: validWeb(dir, publicKeyPem, row.web),
      native: validNative(dir, publicKeyPem, row.native),
    };
  } catch {
    return { web: null, native: null };
  }
}

function releaseRelative(urlPath: string) {
  let decoded = urlPath;
  try { decoded = decodeURIComponent(urlPath); } catch { return ''; }
  if (decoded.includes('\\') || decoded.includes('\0')) return '';
  const match = decoded.match(/^\/app\/releases\/(bundles|apk)\/([A-Za-z0-9._-]{1,80})\.(zip|apk)$/);
  if (!match) return '';
  const folder = match[1];
  const ext = match[3];
  if ((folder === 'bundles' && ext !== 'zip') || (folder === 'apk' && ext !== 'apk')) return '';
  return `${folder}/${match[2]}.${ext}`;
}

/** Streams a signed release file. Returns true when the URL belongs to the release path. */
export function tryServeRelease(dir: string, url: string | undefined, method: string | undefined, res: ServerResponse) {
  const path = url?.split('?')[0] ?? '';
  if (!path.startsWith('/app/releases/')) return false;
  const relativePath = releaseRelative(path);
  const limit = relativePath.endsWith('.apk') ? APK_LIMIT : WEB_LIMIT;
  const file = relativePath ? readReleaseFile(dir, relativePath, limit) : null;
  if (!file || (method !== 'GET' && method !== 'HEAD')) {
    res.statusCode = 404;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('cache-control', 'no-store');
    res.end(method === 'HEAD' ? undefined : 'not found');
    return true;
  }
  res.statusCode = 200;
  res.setHeader('content-type', relativePath.endsWith('.apk') ? 'application/vnd.android.package-archive' : 'application/zip');
  res.setHeader('content-length', String(file.size));
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('cache-control', 'public, max-age=86400');
  res.setHeader('accept-ranges', 'none');
  if (method === 'HEAD') {
    res.end();
    return true;
  }
  const stream = createReadStream(file.path);
  stream.on('error', () => {
    if (!res.headersSent) res.statusCode = 404;
    res.end();
  });
  stream.pipe(res);
  return true;
}
