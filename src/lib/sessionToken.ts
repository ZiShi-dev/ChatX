import { Capacitor, CapacitorCookies } from '@capacitor/core';
import { apiFetchOrigin } from './apiFetchOrigin';

const STORAGE_KEY = 'chatx.session';
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

let memory = readStoredSession();

function readStoredSession() {
  try {
    const value = localStorage.getItem(STORAGE_KEY) ?? '';
    return TOKEN.test(value) ? value : '';
  } catch {
    return '';
  }
}

export function currentSession() {
  return memory || readStoredSession();
}

/** Keeps the login token for the installed app. The WebView drops the cross-site cookie. */
export function rememberSession(payload: unknown) {
  const token = payload && typeof payload === 'object' && typeof (payload as { sessionToken?: unknown }).sessionToken === 'string'
    ? (payload as { sessionToken: string }).sessionToken
    : '';
  if (!TOKEN.test(token)) return;
  memory = token;
  try { localStorage.setItem(STORAGE_KEY, token); } catch { /* The request header still uses the in-memory token. */ }
  if (!Capacitor.isNativePlatform()) return;
  const url = apiFetchOrigin();
  if (!url) return;
  void CapacitorCookies.setCookie({ url, key: 'chatx_session', value: token, path: '/' }).catch(() => undefined);
}

export function clearStoredSession() {
  memory = '';
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* Already gone. */ }
  if (!Capacitor.isNativePlatform()) return;
  const url = apiFetchOrigin();
  if (!url) return;
  void CapacitorCookies.deleteCookie({ url, key: 'chatx_session' }).catch(() => undefined);
}
