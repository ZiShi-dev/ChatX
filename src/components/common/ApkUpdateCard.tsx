import { useState } from 'react';
import { installFailureMessage, installNativeRelease, lookupNativeUpdate } from '../../lib/appRelease';
import { AppRelease } from '../../lib/appReleasePlugin';
import { useI18n, type MessageKey } from '../../lib/i18n';

const notes: Record<'current' | 'none' | 'android' | 'failed' | 'ready' | 'play', MessageKey> = {
  current: 'settings.updateCurrent',
  none: 'settings.updateNone',
  android: 'settings.updateAndroid',
  failed: 'settings.updateFailed',
  ready: 'settings.updateReady',
  play: 'settings.updatePlay',
};

export default function ApkUpdateCard() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<MessageKey | ''>('');
  const [error, setError] = useState('');

  const check = async () => {
    if (busy) return;
    setBusy(true);
    setNote('');
    setError('');
    try {
      const result = await lookupNativeUpdate();
      if (result.kind === 'offer') {
        const source = await AppRelease.installedFromPlay().catch(() => ({ play: false }));
        await installNativeRelease(result.offer);
        setNote(source.play ? 'settings.updatePlay' : 'settings.updateReady');
        return;
      }
      setNote(notes[result.kind]);
    } catch (failure: unknown) {
      setError(installFailureMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-block">
      <h2>{t('settings.updateTitle')}</h2>
      <article className="setting-card column">
        <p>{t('settings.updateLead')}</p>
        <button type="button" className="settings-update-button" disabled={busy} onClick={() => void check()}>
          {busy ? t('settings.updateChecking') : t('settings.updateCheck')}
        </button>
        {note ? (
          <p className={note === 'settings.updateFailed' ? 'form-error' : 'settings-update-status'} role={note === 'settings.updateFailed' ? 'alert' : 'status'}>
            {t(note)}
          </p>
        ) : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </article>
    </section>
  );
}
