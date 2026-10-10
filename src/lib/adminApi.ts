import { Capacitor } from '@capacitor/core';
import { getApiOrigin, nativeNeedsApiOrigin } from './apiOrigin';
import { reportNetworkFailure, reportNetworkSuccess } from '../stores/networkStore';
import { syncServerClock } from './serverClock';
import { retryAfterMs } from './retry';

const HTTPS_ORIGIN = /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/;
let sessionVersion = 0;
const activeRequests = new Set<AbortController>();
const responseCache = new Map<string, { etag: string; body: string }>();
const readCooldowns = new Map<string, { until: number; code: string; status: number }>();
const MAX_CACHE_CHARS = 3_000_000;

function rememberResponse(path: string, etag: string | null, body: string) {
  if (!etag || body.length > 2_000_000) return;
  responseCache.delete(path);
  responseCache.set(path, { etag, body });
  let size = [...responseCache.values()].reduce((total, row) => total + row.body.length, 0);
  while (responseCache.size > 16 || size > MAX_CACHE_CHARS) {
    const first = responseCache.keys().next().value;
    if (!first) break;
    size -= responseCache.get(first)!.body.length;
    responseCache.delete(first);
  }
}

export function invalidateApiSession() {
  sessionVersion += 1;
  activeRequests.forEach((controller) => controller.abort());
  activeRequests.clear();
  responseCache.clear();
  inFlightReads.clear();
  readCooldowns.clear();
}

function adminRequestUrl(path: string, native: boolean, origin: string | undefined) {
  if (!native) return path;
  const base = origin?.trim().replace(/\/$/, '') ?? '';
  if (!HTTPS_ORIGIN.test(base)) return path;
  return `${base}${path}`;
}

export class AdminApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfter: number;

  constructor(code: string, status: number, retryAfter = 0) {
    super(code);
    this.name = 'AdminApiError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

type RequestOptions = { method?: string; body?: unknown; binary?: Uint8Array; hold?: boolean; signal?: AbortSignal };
const inFlightReads = new Map<string, Promise<unknown>>();
export async function adminFetch(path: string, init?: RequestOptions) {
  if ((init?.method ?? 'GET').toUpperCase() !== 'GET') return performFetch(path, init);
  const cooldown = readCooldowns.get(path);
  if (cooldown && cooldown.until > Date.now()) throw new AdminApiError(cooldown.code, cooldown.status, cooldown.until - Date.now());
  readCooldowns.delete(path);
  let promise = inFlightReads.get(path);
  if (!promise) {
    promise = performFetch(path, init).finally(() => { if (inFlightReads.get(path) === promise) inFlightReads.delete(path); });
    inFlightReads.set(path, promise);
  }
  return JSON.parse(JSON.stringify(await promise)) as unknown;
}
async function performFetch(path: string, init?: RequestOptions) {
  if (navigator.onLine === false) throw new AdminApiError('offline', 0);
  const controller = new AbortController();
  const version = sessionVersion;
  activeRequests.add(controller);
  const started = Date.now();
  const slowTimer = init?.hold ? undefined : window.setTimeout(() => reportNetworkFailure(true), 5000);
  const onOffline = () => { reportNetworkFailure(); controller.abort(); };
  const onCallerAbort = () => controller.abort();
  init?.signal?.addEventListener('abort', onCallerAbort);
  if (init?.signal?.aborted) controller.abort();
  window.addEventListener('offline', onOffline);
  const timer = window.setTimeout(() => controller.abort(), init?.hold ? 20_000 : 30_000);
  try {
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers();
    const cached = method === 'GET' ? responseCache.get(path) : undefined;
    if (cached) headers.set('if-none-match', cached.etag);
    if (init?.body) headers.set('content-type', 'application/json');
    if (init?.binary) headers.set('content-type', 'application/octet-stream');
    if (method !== 'GET' && method !== 'HEAD') headers.set('x-chatx-request', '1');
    const response = await fetch(adminRequestUrl(path, Capacitor.isNativePlatform(), import.meta.env.VITE_API_ORIGIN), {
      method,
      credentials: 'include',
      headers,
      body: init?.binary ? new Uint8Array(init.binary).buffer : init?.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    if (controller.signal.aborted) throw new AdminApiError('offline', 0);
    if (version !== sessionVersion) throw new AdminApiError('account_changed', 0);
    syncServerClock(response.headers.get('date'));
    if (response.status === 304 && cached) { reportNetworkSuccess(Date.now() - started, !init?.hold); return JSON.parse(cached.body) as unknown; }
    const body = await response.text();
    let data: unknown = null;
    try { data = JSON.parse(body); } catch { /* Invalid JSON remains unavailable to callers. */ }
    reportNetworkSuccess(Date.now() - started, !init?.hold);
    if (!response.ok) {
      const code = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'unavailable';
      const wait = retryAfterMs(response.headers.get('retry-after'));
      if (method === 'GET' && wait > 0) {
        readCooldowns.set(path, { until: Date.now() + wait, code, status: response.status });
        while (readCooldowns.size > 64) readCooldowns.delete(readCooldowns.keys().next().value!);
      }
      throw new AdminApiError(code, response.status, wait);
    }
    if (controller.signal.aborted) throw new AdminApiError('offline', 0);
    if (version !== sessionVersion) throw new AdminApiError('account_changed', 0);
    if (method === 'GET' && data !== null) rememberResponse(path, response.headers.get('etag'), body);
    return data;
  } catch (error) {
    if (!init?.signal?.aborted && version === sessionVersion && (!(error instanceof AdminApiError) || error.code === 'offline')) reportNetworkFailure();
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError('offline', 0);
  } finally {
    window.clearTimeout(slowTimer);
    init?.signal?.removeEventListener('abort', onCallerAbort);
    window.removeEventListener('offline', onOffline);
    window.clearTimeout(timer);
    activeRequests.delete(controller);
  }
}

export async function adminFetchBlob(path: string) {
  if (navigator.onLine === false) throw new AdminApiError('offline', 0);
  const controller = new AbortController();
  const version = sessionVersion;
  activeRequests.add(controller);
  const timer = window.setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(adminRequestUrl(path, Capacitor.isNativePlatform(), import.meta.env.VITE_API_ORIGIN), {
      credentials: 'include',
      signal: controller.signal,
    });
    if (!response.ok) throw new AdminApiError('unavailable', response.status);
    const blob = await response.blob();
    if (version !== sessionVersion) throw new AdminApiError('account_changed', 0);
    return blob;
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError('offline', 0);
  } finally {
    window.clearTimeout(timer);
    activeRequests.delete(controller);
  }
}
