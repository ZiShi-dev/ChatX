import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { getApiOrigin, isValidApiOrigin } from './apiOrigin';
import { UPDATE_PUBLIC_KEY } from './updatePublicKey';
import { useNetworkStore } from '../stores/networkStore';

const BLOCKED_KEY = 'chatx.blockedBundles';
const WEB_AT_KEY = 'chatx.webPublishedAt';
const APK_LATER_KEY = 'chatx.apkLater';
const CHECK_MS = 15 * 60 * 1000;
const HEX = /^[a-f0-9]{64}$/;
const SIGNATURE = /^[A-Za-z0-9+/]+=*$/;
const VERSION_NAME = /^[0-9]+(?:\.[0-9]+){1,2}$/;

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

export type ReleaseCatalog = { web: WebRelease | null; native: NativeRelease | null };

export type NativeOffer = {
  versionCode: number;
  versionName: string;
  url: string;
  sha256: string;
  signature: string;
};

export type WebOffer = {
  bundleId: string;
  url: string;
  checksum: string;
  signature: string;
  publishedAt: number;
};

/** Keep identical to server/src/releaseCrypto.ts. */
export function webCanonical(input: { bundleId: string; checksum: string; nativeVersionCode: number; publishedAt: number; path: string; signature: string }) {
  return `chatx-web-v1\n${input.bundleId}\n${input.checksum}\n${input.nativeVersionCode}\n${input.publishedAt}\n${input.path}\n${input.signature}\n`;
}

/** Keep identical to server/src/releaseCrypto.ts. */
export function apkCanonical(input: { versionCode: number; versionName: string; sha256: string; path: string; signature: string }) {
  return `chatx-apk-v1\n${input.versionCode}\n${input.versionName}\n${input.sha256}\n${input.path}\n${input.signature}\n`;
}

function versionCode(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1_000_000 ? value : 0;
}

function signed(value: unknown) {
  return typeof value === 'string' && value.length >= 64 && value.length <= 1024 && SIGNATURE.test(value) ? value : '';
}

function spki(pem: string) {
  const body = pem.replace(/-----BEGIN PUBLIC KEY-----/g, '').replace(/-----END PUBLIC KEY-----/g, '').replace(/\s/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

const verifyKeys = new Map<string, CryptoKey>();

async function publicKey(pem: string) {
  const cached = verifyKeys.get(pem);
  if (cached) return cached;
  const key = await crypto.subtle.importKey('spki', spki(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  verifyKeys.set(pem, key);
  return key;
}

export async function signatureMatches(message: string, signature: string, pem = UPDATE_PUBLIC_KEY) {
  try {
    const key = await publicKey(pem);
    const payload = new TextEncoder().encode(message);
    const signedBytes = Uint8Array.from(atob(signature), (char) => char.charCodeAt(0));
    return crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, signedBytes, payload);
  } catch {
    return false;
  }
}

export function readCatalog(value: unknown): ReleaseCatalog {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value as { web?: unknown; native?: unknown } : {};
  return { web: readWeb(row.web), native: readNative(row.native) };
}

function readWeb(value: unknown): WebRelease | null {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!row) return null;
  const nativeVersionCode = versionCode(row.nativeVersionCode);
  const publishedAt = typeof row.publishedAt === 'number' && Number.isInteger(row.publishedAt) && row.publishedAt >= 1_700_000_000_000 && row.publishedAt <= 4_000_000_000_000 ? row.publishedAt : 0;
  const checksum = typeof row.checksum === 'string' && HEX.test(row.checksum) ? row.checksum : '';
  const signature = signed(row.signature);
  const manifestSignature = signed(row.manifestSignature);
  const bundleId = typeof row.bundleId === 'string' ? row.bundleId : '';
  const path = typeof row.path === 'string' ? row.path : '';
  if (!nativeVersionCode || !publishedAt || !checksum || !signature || !manifestSignature) return null;
  if (bundleId !== `w${nativeVersionCode}-${checksum.slice(0, 12)}` || path !== `/app/releases/bundles/${bundleId}.zip`) return null;
  return { bundleId, checksum, signature, manifestSignature, nativeVersionCode, publishedAt, path };
}

function readNative(value: unknown): NativeRelease | null {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!row) return null;
  const version = versionCode(row.versionCode);
  const versionName = typeof row.versionName === 'string' && VERSION_NAME.test(row.versionName) ? row.versionName : '';
  const digest = typeof row.sha256 === 'string' && HEX.test(row.sha256) ? row.sha256 : '';
  const signature = signed(row.signature);
  const manifestSignature = signed(row.manifestSignature);
  const path = typeof row.path === 'string' ? row.path : '';
  if (!version || !versionName || !digest || !signature || !manifestSignature) return null;
  if (path !== `/app/releases/apk/n${version}-${digest.slice(0, 12)}.apk`) return null;
  return { versionCode: version, versionName, sha256: digest, signature, manifestSignature, path };
}

export function planRelease(input: {
  catalog: ReleaseCatalog;
  origin: string;
  installedVersionCode: number;
  blockedBundleIds: string[];
  acceptedPublishedAt: number;
  postponedVersionCode: number;
  online: boolean;
}): { web: WebOffer | null; native: NativeOffer | null } {
  const origin = input.origin.replace(/\/$/, '');
  if (!isValidApiOrigin(origin)) return { web: null, native: null };
  const web = input.catalog.web;
  const native = input.catalog.native;
  const webOffer = input.online && web && web.nativeVersionCode === input.installedVersionCode && web.publishedAt > input.acceptedPublishedAt && !input.blockedBundleIds.includes(web.bundleId)
    ? { bundleId: web.bundleId, url: `${origin}${web.path}`, checksum: web.checksum, signature: web.signature, publishedAt: web.publishedAt }
    : null;
  const nativeOffer = native && native.versionCode > input.installedVersionCode && native.versionCode !== input.postponedVersionCode
    ? { versionCode: native.versionCode, versionName: native.versionName, url: `${origin}${native.path}`, sha256: native.sha256, signature: native.signature }
    : null;
  return { web: webOffer, native: nativeOffer };
}

function readNumber(key: string) {
  const value = Number(localStorage.getItem(key) ?? '');
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function blockedBundles() {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(BLOCKED_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && /^w[1-9][0-9]{0,5}-[a-f0-9]{12}$/.test(item)).slice(-20);
  } catch {
    return [];
  }
}

function rememberBlocked(bundleId: string) {
  const next = [...blockedBundles().filter((item) => item !== bundleId), bundleId].slice(-20);
  localStorage.setItem(BLOCKED_KEY, JSON.stringify(next));
}

export function postponeApk(versionCode: number) {
  localStorage.setItem(APK_LATER_KEY, String(versionCode));
}

export function installFailureMessage(error: unknown) {
  const text = error instanceof Error ? error.message : '';
  if (text.includes('install_permission')) return 'اسمح لتطبيق ChatX بتثبيت التحديثات من الإعدادات، ثم أعد المحاولة.';
  return 'تعذر تثبيت التحديث. تبقى النسخة الحالية.';
}

async function trustedCatalog(value: unknown) {
  const catalog = readCatalog(value);
  if (catalog.web && !await signatureMatches(webCanonical(catalog.web), catalog.web.manifestSignature)) catalog.web = null;
  if (catalog.native && !await signatureMatches(apkCanonical(catalog.native), catalog.native.manifestSignature)) catalog.native = null;
  return catalog;
}

async function downloadWeb(offer: WebOffer) {
  const { LiveUpdate } = await import('@capawesome/capacitor-live-update');
  const present = await LiveUpdate.getBundles();
  if (!present.bundleIds.includes(offer.bundleId)) {
    await LiveUpdate.downloadBundle({
      url: offer.url,
      bundleId: offer.bundleId,
      artifactType: 'zip',
      checksum: offer.checksum,
      signature: offer.signature,
    });
  }
  const next = await LiveUpdate.getNextBundle();
  if (next.bundleId !== offer.bundleId) await LiveUpdate.setNextBundle({ bundleId: offer.bundleId });
  localStorage.setItem(WEB_AT_KEY, String(offer.publishedAt));
}

async function checkRelease(onNative: (offer: NativeOffer | null) => void) {
  const origin = getApiOrigin();
  if (!isValidApiOrigin(origin) || useNetworkStore.getState().network !== 'online') return false;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${origin}/api/app/release`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return false;
    const catalog = await trustedCatalog(await response.json());
    const { LiveUpdate } = await import('@capawesome/capacitor-live-update');
    const [info, blocked] = await Promise.all([
      App.getInfo(),
      LiveUpdate.getBlockedBundles().catch(() => ({ bundleIds: [] as string[] })),
    ]);
    const installed = Number(info.build);
    if (!Number.isInteger(installed) || installed <= 0) return true;
    const plan = planRelease({
      catalog,
      origin,
      installedVersionCode: installed,
      blockedBundleIds: [...blockedBundles(), ...blocked.bundleIds],
      acceptedPublishedAt: readNumber(WEB_AT_KEY),
      postponedVersionCode: readNumber(APK_LATER_KEY),
      online: true,
    });
    onNative(plan.native);
    if (plan.web) await downloadWeb(plan.web);
    return true;
  } catch {
    // The installed copy keeps working when the network or the signature check fails.
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

export function startAppUpdates(onNative: (offer: NativeOffer | null) => void) {
  if (!Capacitor.isNativePlatform()) return () => undefined;
  let stopped = false;
  let checking = false;
  let lastCheck = 0;
  const run = () => {
    if (stopped || checking || useNetworkStore.getState().network !== 'online' || !isValidApiOrigin(getApiOrigin())) return;
    if (lastCheck && Date.now() - lastCheck < CHECK_MS) return;
    checking = true;
    lastCheck = Date.now();
    void checkRelease((offer) => { if (!stopped) onNative(offer); }).then((done) => {
      if (!done) lastCheck = 0;
    }).finally(() => { checking = false; });
  };
  void import('@capawesome/capacitor-live-update').then(async ({ LiveUpdate }) => {
    if (stopped) return;
    const info = await App.getInfo().catch(() => null);
    const installed = Number(info?.build);
    const current = await LiveUpdate.getCurrentBundle().catch(() => ({ bundleId: null }));
    if (Number.isInteger(installed) && installed > 0 && current.bundleId && !current.bundleId.startsWith(`w${installed}-`)) {
      await LiveUpdate.reset().catch(() => undefined);
      return;
    }
    const ready = await LiveUpdate.ready().catch(() => null);
    if (ready?.rollback && ready.previousBundleId) rememberBlocked(ready.previousBundleId);
  }).catch(() => undefined);
  const initial = window.setTimeout(run, 5000);
  const followUp = window.setTimeout(run, 25000);
  const resume = App.addListener('appStateChange', ({ isActive }) => { if (isActive) run(); });
  return () => {
    stopped = true;
    window.clearTimeout(initial);
    window.clearTimeout(followUp);
    void resume.then((handle) => handle.remove());
  };
}

export async function installNativeRelease(offer: NativeOffer) {
  const { AppRelease } = await import('./appReleasePlugin');
  await AppRelease.installApk(offer);
}
