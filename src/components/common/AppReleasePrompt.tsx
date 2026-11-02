import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { installFailureMessage, installNativeRelease, postponeApk, startAppUpdates, type NativeOffer } from '../../lib/appRelease';
import { AppRelease } from '../../lib/appReleasePlugin';
import { useI18n } from '../../lib/i18n';

export default function AppReleasePrompt() {
  const [offer, setOffer] = useState<NativeOffer | null>(null);
  const [fromPlay, setFromPlay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { t } = useI18n();

  useEffect(() => {
    let alive = true;
    void AppRelease.installedFromPlay().then((source) => {
      if (alive) setFromPlay(source.play);
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => startAppUpdates((next) => {
    setError('');
    setOffer(next);
  }), []);

  if (!offer) return null;
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
        <h2 id="app-release-title">{t('release.title')}</h2>
        <p className="account-warn">{fromPlay
          ? <>{t('release.available')} <bdi dir="ltr">{offer.versionName || offer.versionCode}</bdi> {t('release.play')}</>
          : <>{t('release.available')} <bdi dir="ltr">{offer.versionName || offer.versionCode}</bdi>. {t('release.side')}</>}</p>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="account-actions">
          <button type="button" className="is-allow" disabled={busy} onClick={install}>{fromPlay ? (busy ? t('release.opening') : t('release.openStore')) : (busy ? t('release.downloading') : t('release.install'))}</button>
          <button type="button" disabled={busy} onClick={later}>{t('release.later')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
