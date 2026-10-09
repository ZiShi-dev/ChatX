import { useEffect, useRef, useState } from 'react';
import { IonContent, IonIcon, IonPage } from '@ionic/react';
import { cameraOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import Avatar from '../components/common/Avatar';
import { useDataSaver } from '../hooks/useDataSaver';
import { brandName, DEFAULT_LOGO } from '../lib/appearance';
import { readBanner, readPhoto } from '../lib/photo';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';

type GoogleButton = {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (response: { credential?: string }) => void; auto_select?: boolean }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, string | number>) => void;
      cancel: () => void;
    };
  };
};

function clearGoogleButton() {
  window.google?.accounts.id.cancel();
  document.querySelectorAll('.S9gUrf-YoZ4jf, .nsm7Bb-HzV7m-LgbsSe').forEach((node) => node.remove());
}

declare global {
  interface Window {
    google?: GoogleButton;
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';

export default function ActivationPage() {
  const navigate = useNavigate();
  const dataSaver = useDataSaver();
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const finishGoogleProfile = useAuthStore((state) => state.finishGoogleProfile);
  const currentUser = useAuthStore((state) => state.currentUser);
  const photoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const googleRef = useRef<HTMLDivElement>(null);
  const onCredential = useRef<(credential: string) => void>(() => undefined);
  const [step, setStep] = useState<'google' | 'profile'>('google');
  const [credential, setCredential] = useState('');
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState('');
  const [banner, setBanner] = useState('');
  const [bio, setBio] = useState('');
  const [error, setError] = useState('');
  const brandTitle = useSettingsStore((state) => state.appearance.name);
  const brandLogo = useSettingsStore((state) => state.appearance.logo);

  onCredential.current = (token: string) => {
    void (async () => {
      const result = await signInWithGoogle(token);
      if (!result.ok) {
        setError(result.reason === 'offline' ? 'تعذر الاتصال.' : result.reason === 'rate_limited' ? 'حاول بعد قليل' : 'حساب Google غير صالح.');
        return;
      }
      if (result.step === 'ready') {
        navigate('/home', { replace: true });
        return;
      }
      setCredential(token);
      setName(result.name);
      setPhoto(dataSaver ? '' : result.picture);
      setError('');
      setStep('profile');
    })();
  };

  useEffect(() => {
    if (step !== 'google' || !CLIENT_ID || !googleRef.current) return;
    let cancelled = false;
    const render = () => {
      if (cancelled || !googleRef.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        auto_select: false,
        callback: (response) => {
          if (response.credential) onCredential.current(response.credential);
        },
      });
      googleRef.current.replaceChildren();
      window.google.accounts.id.renderButton(googleRef.current, {
        theme: 'filled_black',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        locale: 'ar',
        width: 280,
      });
    };
    if (window.google) {
      render();
      return () => {
        cancelled = true;
        googleRef.current?.replaceChildren();
        clearGoogleButton();
      };
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
    return () => {
      cancelled = true;
      script.onload = null;
      googleRef.current?.replaceChildren();
      clearGoogleButton();
    };
  }, [step]);

  useEffect(() => {
    if (step !== 'profile') return;
    clearGoogleButton();
    const observer = new MutationObserver(() => {
      if (document.querySelector('.S9gUrf-YoZ4jf, .nsm7Bb-HzV7m-LgbsSe')) clearGoogleButton();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [step]);

  const pickPhoto = async (file?: File) => {
    if (!file) return;
    const url = await readPhoto(file).catch(() => '');
    if (url) setPhoto(url);
  };

  const submitProfile = async () => {
    const displayName = name.trim();
    if (displayName.length < 2) {
      setError('اكتب اسمك.');
      return;
    }
    const result = await finishGoogleProfile(credential, displayName, {
      ...(photo ? { avatarUrl: photo } : {}),
      ...(bio.trim() ? { bio: bio.trim() } : {}),
      ...(banner ? { bannerUrl: banner } : {}),
    });
    if (result !== 'ok') {
      if (result === 'offline') setError('تعذر الاتصال.');
      else if (result === 'rate_limited') setError('حاول بعد قليل');
      else if (result === 'username_taken') setError('هذا الاسم مستخدم.');
      else if (result === 'profile') setError('تعذر حفظ الغلاف أو النبذة.');
      else {
        setError('حساب Google غير صالح.');
        setStep('google');
      }
      return;
    }
    navigate('/home', { replace: true });
  };

  return (
    <IonPage>
      <IonContent className="activation">
        <div className="gate">
          <div className="gate-brand">
            <img src={brandLogo || DEFAULT_LOGO} alt="" width="96" height="96" decoding="async" />
            <strong dir="auto">{brandName(brandTitle)}</strong>
          </div>
          <div className="gate-card">
            <span className="gate-dots" aria-hidden="true">
              <i className={step === 'google' ? 'on' : ''} />
              <i className={step === 'profile' ? 'on' : ''} />
            </span>
            {step === 'google' ? (
              <div key="google-step">
                <h1>الدخول</h1>
                <p className="muted">سجّل الدخول بحساب Google. إذا كان الحساب صالحًا، تنتقل إلى الخطوة التالية.</p>
                {CLIENT_ID ? <div ref={googleRef} className="google-slot" /> : <p className="form-error">تسجيل الدخول بحساب Google غير مُعد.</p>}
                {error && <p className="form-error">{error}</p>}
              </div>
            ) : (
              <div key="profile-step" className="account-setup">
                <h1>حسابك</h1>
                <p className="muted">أكّد اسمك، ثم أضف صورة وغلافًا ونبذة إن شئت.</p>
                <div className="account-hero">
                  <button type="button" className={banner ? 'account-cover is-photo' : 'account-cover'} aria-label="اختيار الغلاف" onClick={() => bannerRef.current?.click()}>
                    {banner ? <img src={banner} alt="" /> : <span>إضافة غلاف</span>}
                  </button>
                  {banner ? (
                    <button type="button" className="account-cover-clear" aria-label="إزالة الغلاف" onClick={() => setBanner('')}>
                      إزالة
                    </button>
                  ) : null}
                  <button type="button" className="photo-pick account-avatar" aria-label="صورة الملف" onClick={() => photoRef.current?.click()}>
                    <Avatar name={name || '؟'} color={currentUser.color} size={88} src={photo || undefined} />
                    <span className="photo-badge">
                      <IonIcon icon={cameraOutline} />
                    </span>
                  </button>
                </div>
                <input
                  ref={bannerRef}
                  className="photo-file"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    void readBanner(file).then((url) => {
                      if (url) setBanner(url);
                    }).catch(() => undefined);
                  }}
                />
                <input
                  ref={photoRef}
                  className="photo-file"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    void pickPhoto(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
                <label className="gate-field">
                  <span>الاسم</span>
                  <input
                    value={name}
                    dir="auto"
                    placeholder="اسمك"
                    autoFocus
                    onChange={(event) => {
                      setName(event.target.value);
                      setError('');
                    }}
                  />
                </label>
                <label className="gate-field">
                  <span className="field-line"><span>النبذة</span><b>{bio.length}/160</b></span>
                  <textarea
                    value={bio}
                    dir="auto"
                    maxLength={160}
                    placeholder="اكتب نبذة قصيرة"
                    onChange={(event) => {
                      setBio(event.target.value);
                      setError('');
                    }}
                  />
                </label>
                {error && <p className="form-error">{error}</p>}
                <button type="button" className="gate-go" onClick={() => void submitProfile()}>متابعة</button>
                <button type="button" className="setup-back" onClick={() => { setError(''); setStep('google'); }}>رجوع</button>
              </div>
            )}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
}
