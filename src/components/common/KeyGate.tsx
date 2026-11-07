import { useEffect, useState, type ReactNode } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { AdminApiError } from '../../lib/adminApi';
import { createKeys, keySetupState, localIdentity, restoreKeys, type KeySetup } from '../../lib/e2e';
import { currentSession } from '../../lib/sessionToken';
import { RECOVERY_CODE_MIN } from '../../lib/e2eCrypto';
import { isServerId } from '../../lib/home';
import { useAuthStore } from '../../stores/authStore';
import { t } from '../../lib/i18n';
import PageSkeleton from './PageSkeleton';

type Phase = KeySetup | 'checking' | 'offline' | 'forgot';

function failureText(error: unknown) {
  if (!(error instanceof AdminApiError)) return t('keyGate.errPrepare');
  if (error.code === 'rate_limited') return t('keyGate.errRate');
  if (error.code === 'offline') return t('keyGate.errOffline');
  if (error.code === 'invalid_credentials' || error.code === 'account_changed') return t('keyGate.errSession');
  if (error.status >= 500) return t('keyGate.errServer');
  return t('keyGate.errSaveKey');
}

/** WebCrypto only exists on https, localhost and inside the Android app. */
const cryptoAvailable = () => typeof window !== 'undefined' && window.isSecureContext && Boolean(globalThis.crypto?.subtle);

/** Server accounts need an identity key on this device before any chat opens. */
export default function KeyGate({ children }: { children: ReactNode }) {
  const owner = useAuthStore((state) => state.currentUser.id);
  const activated = useAuthStore((state) => state.activated);
  const logout = useAuthStore((state) => state.logout);
  const needed = activated && isServerId(owner);
  const [phase, setPhase] = useState<{ owner: string; value: Phase }>({ owner: '', value: 'checking' });
  const [attempt, setAttempt] = useState(0);
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!needed) return;
    let live = true;
    let retryTimer = 0;
    const show = (value: Phase) => { if (live) setPhase({ owner, value }); };
    void (async () => {
      // A local key opens the app at once; the server check only catches a reset from another device.
      if (await localIdentity(owner)) show('ready');
      try { show(await keySetupState(owner)); } catch (error) {
        if (!live) return;
        if (await localIdentity(owner)) { show('ready'); return; }
        const temporary = !(error instanceof AdminApiError) || error.code === 'offline' || error.status === 0 || error.status >= 500;
        if (temporary && attempt < 3) {
          retryTimer = window.setTimeout(() => { if (live) setAttempt((value) => value + 1); }, 2000);
          return;
        }
        // First login has no key on this phone. A failed check must still open the code form.
        if (error instanceof AdminApiError && error.code === 'invalid_credentials' && error.status === 401 && !currentSession()) {
          // The account exists, but this install has no login token. A password form cannot open it.
          logout();
          return;
        }
        if (error instanceof AdminApiError && (error.code === 'invalid_credentials' || error.code === 'account_changed' || error.code === 'rate_limited')) {
          setError(failureText(error));
        }
        show('create');
      }
    })();
    return () => { live = false; window.clearTimeout(retryTimer); };
  }, [needed, owner, attempt]);

  useEffect(() => {
    if (!needed || (phase.owner === owner ? phase.value : 'checking') !== 'offline') return;
    const retry = () => setAttempt((value) => value + 1);
    window.addEventListener('online', retry);
    const onVisible = () => { if (document.visibilityState === 'visible') retry(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [needed, owner, phase]);

  if (!needed) return <>{children}</>;
  const current = phase.owner === owner ? phase.value : 'checking';
  if (current === 'ready') return <>{children}</>;
  if (current === 'checking') return <PageSkeleton kind="settings" />;

  const creating = current === 'create' || current === 'forgot';
  const go = (value: Phase, message = '') => {
    setPhase({ owner, value });
    setCode('');
    setConfirm('');
    setError(message);
  };
  const submit = async () => {
    if (busy) return;
    if (!cryptoAvailable()) { setError(failureText(null)); return; }
    if (code.length < RECOVERY_CODE_MIN) { setError(t('keyGate.recoveryMin', { min: RECOVERY_CODE_MIN })); return; }
    if (creating && code !== confirm) { setError(t('keyGate.recoveryMismatch')); return; }
    setBusy(true);
    setError('');
    try {
      if (creating) {
        const result = await createKeys(owner, code, current === 'forgot');
        if (result === 'exists') go('restore', t('keyGate.recoveryExists'));
        else go('ready');
        return;
      }
      const result = await restoreKeys(owner, code);
      if (result === 'wrong') setError(t('keyGate.recoveryWrong'));
      else go(result === 'missing' ? 'create' : 'ready');
    } catch (failure) {
      setError(failureText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <IonPage>
      <IonContent className="activation">
        <div className="gate">
          <div className="gate-card key-gate">
            {current === 'offline' ? (
              <>
                <h1>{t('keyGate.titleCrypto')}</h1>
                <p className="muted">{error || t('keyGate.offlineHint')}</p>
                <button type="button" className="gate-go" onClick={() => setAttempt((value) => value + 1)}>{t('keyGate.retry')}</button>
              </>
            ) : (
              <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
                <h1>{current === 'restore' ? t('keyGate.titleOpen') : current === 'forgot' ? t('keyGate.titleNew') : t('keyGate.titleProtect')}</h1>
                {current === 'restore' && <p className="muted">{t('keyGate.restoreLead')}</p>}
                {current === 'create' && (
                  <p className="muted">{t('keyGate.createLead')}</p>
                )}
                {current === 'forgot' && (
                  <p className="key-warn">{t('keyGate.forgotWarn')}</p>
                )}
                <label className="gate-field">
                  <span>{t('keyGate.recoveryLabel')}</span>
                  <input
                    type="password"
                    dir="auto"
                    value={code}
                    maxLength={128}
                    autoComplete={creating ? 'new-password' : 'current-password'}
                    autoFocus
                    disabled={busy}
                    onChange={(event) => { setCode(event.target.value); setError(''); }}
                  />
                </label>
                {creating && (
                  <label className="gate-field">
                    <span>{t('keyGate.confirmLabel')}</span>
                    <input
                      type="password"
                      dir="auto"
                      value={confirm}
                      maxLength={128}
                      autoComplete="new-password"
                      disabled={busy}
                      onChange={(event) => { setConfirm(event.target.value); setError(''); }}
                    />
                  </label>
                )}
                {error && <p className="form-error" role="alert">{error}</p>}
                <button type="submit" className="gate-go" disabled={busy} aria-busy={busy}>
                  {busy ? t('keyGate.busy') : current === 'restore' ? t('keyGate.openMessages') : t('keyGate.enableCrypto')}
                </button>
                {current === 'restore' && (
                  <button type="button" className="setup-back" disabled={busy} onClick={() => go('forgot')}>{t('keyGate.forgot')}</button>
                )}
                {current === 'forgot' && (
                  <button type="button" className="setup-back" disabled={busy} onClick={() => go('restore')}>{t('keyGate.back')}</button>
                )}
              </form>
            )}
            <button type="button" className="setup-back" disabled={busy} onClick={logout}>{t('profile.logOut')}</button>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
}
