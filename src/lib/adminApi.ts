import { Capacitor } from '@capacitor/core';

const HTTPS_ORIGIN = /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/;
let sessionVersion = 0;
const activeRequests = new Set<AbortController>();

export function invalidateApiSession() {
  sessionVersion += 1;
  activeRequests.forEach((controller) => controller.abort());
  activeRequests.clear();
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
  const timer = window.setTimeout(() => controller.abort(), 30_000);
  try {
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers();
    if (init?.body) headers.set('content-type', 'application/json');
    if (method !== 'GET' && method !== 'HEAD') headers.set('x-chatx-request', '1');
    const response = await fetch(adminRequestUrl(path, Capacitor.isNativePlatform(), import.meta.env.VITE_API_ORIGIN), {
      method,
      credentials: 'include',
      headers,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'unavailable';
      throw new AdminApiError(code, response.status);
    }
    if (controller.signal.aborted) throw new AdminApiError('offline', 0);
    if (version !== sessionVersion) throw new AdminApiError('account_changed', 0);
    return data;
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError('offline', 0);
  } finally {
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
