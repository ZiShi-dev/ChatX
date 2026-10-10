import { useEffect, useState, type ReactNode } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { AdminApiError } from '../../lib/adminApi';
import { createKeys, keySetupState, localIdentity, restoreKeys, type KeySetup } from '../../lib/e2e';
import { RECOVERY_CODE_MIN } from '../../lib/e2eCrypto';
import { isServerId } from '../../lib/home';
import { useAuthStore } from '../../stores/authStore';
import PageSkeleton from './PageSkeleton';

type Phase = KeySetup | 'checking' | 'offline' | 'forgot';

function failureText(error: unknown) {
  if (!(error instanceof AdminApiError)) return 'تعذر تجهيز التشفير على هذا الجهاز. افتح ChatX من التطبيق أو من عنوان آمن (https) ثم أعد المحاولة.';
  if (error.code === 'rate_limited') return 'محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.';
  if (error.code === 'offline') return 'تعذر الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة.';
  if (error.status >= 500) return 'حدث خطأ في الخادم أثناء حفظ المفتاح. أعد المحاولة بعد قليل.';
  return 'تعذر حفظ المفتاح. أعد المحاولة.';
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
    const show = (value: Phase) => { if (live) setPhase({ owner, value }); };
    void (async () => {
      // A local key opens the app at once; the server check only catches a reset from another device.
      if (await localIdentity(owner)) show('ready');
      try { show(await keySetupState(owner)); } catch { if (!(await localIdentity(owner))) show('offline'); }
    })();
    return () => { live = false; };
  }, [needed, owner, attempt]);

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
    if (code.length < RECOVERY_CODE_MIN) { setError(`رمز الاسترداد ${RECOVERY_CODE_MIN} حرفًا على الأقل.`); return; }
    if (creating && code !== confirm) { setError('الرمزان غير متطابقين.'); return; }
    setBusy(true);
    setError('');
    try {
      if (creating) {
        const result = await createKeys(owner, code, current === 'forgot');
        if (result === 'exists') go('restore', 'هذا الحساب لديه رمز استرداد. أدخله لفتح رسائلك.');
        else go('ready');
        return;
      }
      const result = await restoreKeys(owner, code);
      if (result === 'wrong') setError('رمز الاسترداد غير صحيح.');
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
                <h1>تشفير الرسائل</h1>
                <p className="muted">يحتاج إعداد التشفير على هذا الجهاز إلى اتصال بالإنترنت مرة واحدة.</p>
                <button type="button" className="gate-go" onClick={() => setAttempt((value) => value + 1)}>إعادة المحاولة</button>
              </>
            ) : (
              <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
                <h1>{current === 'restore' ? 'فتح رسائلك' : current === 'forgot' ? 'رمز جديد' : 'حماية رسائلك'}</h1>
                {current === 'restore' && <p className="muted">أدخل رمز الاسترداد الذي اخترته لفتح رسائلك المشفرة على هذا الجهاز.</p>}
                {current === 'create' && (
                  <p className="muted">تُشفَّر رسائلك الجديدة على هاتفك، ولا يستطيع الخادم قراءتها. اختر رمز استرداد تحفظه جيدًا: ستحتاجه على أي جهاز جديد، ولا يمكن لأحد استرجاعه إن نسيته.</p>
                )}
                {current === 'forgot' && (
                  <p className="key-warn">سيُنشأ مفتاح جديد لحسابك. قد لا تُفتح الرسائل المشفرة السابقة إلى أن يفتح الأعضاء الآخرون المحادثات من أجهزتهم.</p>
                )}
                <label className="gate-field">
                  <span>رمز الاسترداد</span>
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
                    <span>تأكيد الرمز</span>
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
                  {busy ? 'جارٍ التجهيز…' : current === 'restore' ? 'فتح الرسائل' : 'تفعيل التشفير'}
                </button>
                {current === 'restore' && (
                  <button type="button" className="setup-back" disabled={busy} onClick={() => go('forgot')}>نسيت الرمز</button>
                )}
                {current === 'forgot' && (
                  <button type="button" className="setup-back" disabled={busy} onClick={() => go('restore')}>رجوع</button>
                )}
              </form>
            )}
            <button type="button" className="setup-back" disabled={busy} onClick={logout}>تسجيل الخروج</button>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
}
