import { Capacitor } from '@capacitor/core';
import { getApiOrigin } from './apiOrigin';

const HTTPS_ORIGIN = /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/;

/** Resolved HTTPS API base for native fetches (stored setting, then build-time env). */
export function apiFetchOrigin() {
  const stored = getApiOrigin();
  if (stored) return stored;
  const env = String(import.meta.env.VITE_API_ORIGIN ?? '').trim().replace(/\/$/, '');
  return HTTPS_ORIGIN.test(env) ? env : '';
}

export function nativeApiPath(path: string) {
  if (!Capacitor.isNativePlatform()) return path;
  const base = apiFetchOrigin();
  if (!base) return path;
  return `${base}${path}`;
}
