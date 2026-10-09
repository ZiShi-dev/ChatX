import { Capacitor } from '@capacitor/core';
import { reportNetworkFailure, reportNetworkSuccess } from '../stores/networkStore';

const HTTPS_ORIGIN = /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/;
let sessionVersion = 0;
const activeRequests = new Set<AbortController>();
const responseCache = new Map<string, { etag: string; body: string }>();
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

  constructor(code: string, status: number) {
    super(code);
    this.name = 'AdminApiError';
    this.code = code;
    this.status = status;
  }
}

export async function adminFetch(path: string, init?: { method?: string; body?: unknown }) {
  if (navigator.onLine === false) throw new AdminApiError('offline', 0);
  const controller = new AbortController();
  const version = sessionVersion;
  activeRequests.add(controller);
  const started = Date.now();
  const slowTimer = window.setTimeout(() => reportNetworkFailure(true), 5000);
  const onOffline = () => { reportNetworkFailure(); controller.abort(); };
  window.addEventListener('offline', onOffline);
  const timer = window.setTimeout(() => controller.abort(), 30_000);
  try {
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers();
    const cached = method === 'GET' ? responseCache.get(path) : undefined;
    if (cached) headers.set('if-none-match', cached.etag);
    if (init?.body) headers.set('content-type', 'application/json');
    if (method !== 'GET' && method !== 'HEAD') headers.set('x-chatx-request', '1');
    const response = await fetch(adminRequestUrl(path, Capacitor.isNativePlatform(), import.meta.env.VITE_API_ORIGIN), {
      method,
      credentials: 'include',
      headers,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    if (controller.signal.aborted) throw new AdminApiError('offline', 0);
    if (version !== sessionVersion) throw new AdminApiError('account_changed', 0);
    if (response.status === 304 && cached) { reportNetworkSuccess(Date.now() - started); return JSON.parse(cached.body) as unknown; }
    const body = await response.text();
    let data: unknown = null;
    try { data = JSON.parse(body); } catch { /* Invalid JSON remains unavailable to callers. */ }
    reportNetworkSuccess(Date.now() - started);
    if (!response.ok) {
      const code = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'unavailable';
      throw new AdminApiError(code, response.status);
    }
    if (controller.signal.aborted) throw new AdminApiError('offline', 0);
    if (version !== sessionVersion) throw new AdminApiError('account_changed', 0);
    if (method === 'GET' && data !== null) rememberResponse(path, response.headers.get('etag'), body);
    return data;
  } catch (error) {
    if (version === sessionVersion && (!(error instanceof AdminApiError) || error.code === 'offline')) reportNetworkFailure();
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError('offline', 0);
  } finally {
    window.clearTimeout(slowTimer);
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
