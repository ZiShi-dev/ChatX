import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { getApiOrigin } from '../../lib/apiOrigin';
import { apkCanonical, readCatalog, signatureMatches, installNativeRelease } from '../../lib/appRelease';

const repository = 'https://github.com/ZiShi-dev/ChatX';
export default function ApkUpdateCard() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function download() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const origin = getApiOrigin();
      const response = await fetch(`${origin}/api/app/release`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('unavailable');
      const release = readCatalog(await response.json()).native;
      if (!release) { setError('لا يوجد إصدار APK منشور بعد.'); return; }
      if (!await signatureMatches(apkCanonical(release), release.manifestSignature)) throw new Error('signature');
      if (Capacitor.getPlatform() !== 'android') { setError('تحديث APK مخصص لتطبيق أندرويد.'); return; }
      const { App } = await import('@capacitor/app');
      const info = await App.getInfo();
      if (release.versionCode <= Number(info.build)) { setError('لديك آخر إصدار من التطبيق.'); return; }
      await installNativeRelease({ ...release, url: `${origin}${release.path}` });
    } catch {
      setError('تعذر التحديث. تحقق من الإنترنت والسماح بتثبيت التطبيقات. تبقى نسختك الحالية.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-block">
      <h2>تحديث التطبيق</h2>
      <article className="setting-card column">
        <strong>آخر إصدار من ChatX</strong>
        <p>تحقق من الإصدار المتاح على خادم ChatX، ثم أكد تثبيت التحديث على أندرويد. لا يلزم حذف التطبيق.</p>
        <button type="button" className="storage-clear" disabled={busy} onClick={() => void download()}>{busy ? 'جارٍ التحقق والتنزيل' : 'التحقق من تحديث التطبيق'}</button>
        <a href={repository} target="_blank" rel="noopener noreferrer">مستودع ChatX</a>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </article>
    </section>
  );
}
