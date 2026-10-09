import { Capacitor } from '@capacitor/core';

export function installOfflineShell() {
  if (Capacitor.isNativePlatform() || !('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  // Hashed static files reuse the HTTP cache; private API responses remain account scoped.
  const legacy = !('noModule' in document.createElement('script'));
  void navigator.serviceWorker.register(`/sw.js${legacy ? '?legacy=1' : ''}`, { updateViaCache: 'none' }).catch(() => undefined);
}
