import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { installFailureMessage, installNativeRelease, postponeApk, startAppUpdates, type NativeOffer } from '../../lib/appRelease';

export default function AppReleasePrompt() {
  const [offer, setOffer] = useState<NativeOffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => startAppUpdates((next) => {
    setError('');
    setOffer(next);
  }), []);

  if (!offer) return null;
  const versionName = offer.versionName;
  const install = () => {
    if (busy) return;
    setBusy(true);
    setError('');
    void installNativeRelease(offer).then(() => {
      setBusy(false);
      setOffer(null);
    }, (failure: unknown) => {
      setBusy(false);
      setError(installFailureMessage(failure));
    });
  };
  const later = () => {
    if (busy) return;
    postponeApk(offer.versionCode);
    setOffer(null);
  };

  return createPortal(
    <div className="wa-scrim center" onClick={later}>
      <div className="account-dialog notify-ask" role="alertdialog" aria-labelledby="app-release-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="app-release-title">تحديث التطبيق</h2>
        <p className="account-warn">يتوفر الإصدار {versionName}. التثبيت يحتاج تأكيدك، وتبقى النسخة الحالية إن لم يكتمل التنزيل.</p>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="account-actions">
          <button type="button" className="is-allow" disabled={busy} onClick={install}>{busy ? 'جارٍ التنزيل' : 'تثبيت'}</button>
          <button type="button" disabled={busy} onClick={later}>ليس الآن</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
