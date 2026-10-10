import { Capacitor } from '@capacitor/core';

const STORAGE_KEY = 'chatx.apiOrigin';
const HTTPS_ORIGIN = /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/;

function normalize(value: string) {
  return value.trim().replace(/\/$/, '');
}

export function isValidApiOrigin(value: string) {
  return HTTPS_ORIGIN.test(normalize(value));
}

export function readStoredApiOrigin() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return '';
    const value = normalize(raw);
    return isValidApiOrigin(value) ? value : '';
  } catch {
    return '';
  }
}

/** HTTPS API base for the installed app; empty on web (proxy) or when unset. */
export function getApiOrigin() {
  if (!Capacitor.isNativePlatform()) return '';
  const env = normalize(String(import.meta.env.VITE_API_ORIGIN ?? ''));
  const stored = readStoredApiOrigin();
  const base = stored || (isValidApiOrigin(env) ? env : '');
  return base;
}

export function nativeNeedsApiOrigin() {
  return Capacitor.isNativePlatform() && !getApiOrigin();
}

export function saveApiOrigin(value: string) {
  const base = normalize(value);
  if (!base) {
    localStorage.removeItem(STORAGE_KEY);
    return '';
  }
  if (!isValidApiOrigin(base)) throw new Error('invalid');
  localStorage.setItem(STORAGE_KEY, base);
  return base;
}
