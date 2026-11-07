import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { IonContent, IonIcon, IonPage } from '@ionic/react';
import { cameraOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import Avatar from '../components/common/Avatar';
import { useDataSaver } from '../hooks/useDataSaver';
import { useProfileMotion } from '../hooks/useProfileMotion';
import { brandName, DEFAULT_LOGO } from '../lib/appearance';
import LanguagePicker from '../components/common/LanguagePicker';
import { useI18n, type MessageKey } from '../lib/i18n';
import { readBanner, readPhoto } from '../lib/photo';
import { AVATAR_DECORATIONS, type AvatarDecoration } from '../lib/profileCosmetics';
import { displayNameFontClass, displayNameStyleForUser, MESSAGE_FONT_OPTIONS, normalizeUserColorInput, sanitizeUserColor } from '../lib/userStyle';
import type { MessageFontId } from '../types/user';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { type Locale } from '../lib/locale';

type GoogleButton = {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (response: { credential?: string }) => void; auto_select?: boolean; use_fedcm_for_button?: boolean; itp_support?: boolean }) => void;
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
const PROFILE_PARTS = ['details', 'look', 'effects'] as const;
type ProfilePart = (typeof PROFILE_PARTS)[number];

function connectionError(reason: string, t: (key: MessageKey) => string) {
  if (reason === 'offline') return t('activation.errOffline');
  if (reason === 'rate_limited') return t('activation.errRateLimited');
  return '';
}

function imageProblem(error: unknown, kind: 'photo' | 'banner', t: (key: MessageKey) => string) {
  const tooBig = error instanceof Error && error.message === 'image_too_large';
  if (kind === 'photo') return tooBig ? t('activation.errPhotoTooBig') : t('activation.errPhotoRead');
  return tooBig ? t('activation.errBannerTooBig') : t('activation.errBannerRead');
}

function googleButtonLocale(locale: Locale) {
  return locale === 'ar' ? 'ar' : locale === 'fr' ? 'fr' : 'en';
}

export default function ActivationPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const dataSaver = useDataSaver();
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const finishGoogleProfile = useAuthStore((state) => state.finishGoogleProfile);
  const currentUser = useAuthStore((state) => state.currentUser);
  const animate = useProfileMotion();
  const photoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const googleRef = useRef<HTMLDivElement>(null);
  const onCredential = useRef<(credential: string) => void>(() => undefined);
  const googlePending = useRef(false);
  const [connecting, setConnecting] = useState(false);
  const [step, setStep] = useState<'google' | 'profile'>('google');
  const [part, setPart] = useState<ProfilePart>('details');
  const [credential, setCredential] = useState('');
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState('');
  const [banner, setBanner] = useState('');
  const [bio, setBio] = useState('');
  const [color, setColor] = useState(() => sanitizeUserColor(currentUser.color));
  const [colorInput, setColorInput] = useState(() => sanitizeUserColor(currentUser.color));
  const [font, setFont] = useState<MessageFontId>('system');
  const [decoration, setDecoration] = useState<AvatarDecoration>('none');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const colorValid = /^#[0-9a-f]{6}$/.test(color);
  const remotePreview = photo.startsWith('https://');
  const brandTitle = useSettingsStore((state) => state.appearance.name);
  const brandLogo = useSettingsStore((state) => state.appearance.logo);
  const uiLocale = useSettingsStore((state) => state.locale);

  onCredential.current = (token: string) => {
    if (googlePending.current) return;
    googlePending.current = true;
    setConnecting(true);
    setError('');
    void (async () => {
      try {
      const result = await signInWithGoogle(token);
      if (!result.ok) {
        setError(connectionError(result.reason, t) || t('activation.errGoogleVerify'));
        return;
      }
      if (result.step === 'ready') {
        navigate('/home', { replace: true });
        return;
      }
      setCredential(token);
      setName(result.name);
      setPhoto(dataSaver ? '' : result.picture);
      setPart('details');
      setError('');
      setStep('profile');
      } catch {
        setError(t('activation.errOffline'));
      } finally {
        googlePending.current = false;
        setConnecting(false);
      }
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
        use_fedcm_for_button: false,
        itp_support: true,
        callback: (response) => {
          if (response.credential) onCredential.current(response.credential);
        },
      });
      googleRef.current.replaceChildren();
      const width = Math.round(googleRef.current.getBoundingClientRect().width) || 280;
      window.google.accounts.id.renderButton(googleRef.current, {
        theme: 'outline',
        size: 'large',
        shape: 'rectangular',
        text: 'continue_with',
        locale: googleButtonLocale(uiLocale),
        width,
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
  }, [step, uiLocale]);

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
    try {
      setPhoto(await readPhoto(file));
      setError('');
    } catch (problem) {
      setError(imageProblem(problem, 'photo', t));
    }
  };

  const pickBanner = async (file?: File) => {
    if (!file) return;
    try {
      setBanner(await readBanner(file));
      setError('');
    } catch (problem) {
      setError(imageProblem(problem, 'banner', t));
    }
  };

  const chooseColor = (next: string) => {
    const value = sanitizeUserColor(next, color);
    setColor(value);
    setColorInput(value);
    setError('');
  };

  const continueProfile = () => {
    if (part === 'details') {
      if (name.trim().length < 2) {
        setError(t('activation.nameShort'));
        nameRef.current?.focus();
        return;
      }
      setError('');
      setPart('look');
      return;
    }
    if (!colorValid) {
      setError(t('activation.errColorFormat'));
      return;
    }
    setError('');
    setPart('effects');
  };

  const backProfile = () => {
    setError('');
    if (part === 'effects') setPart('look');
    else if (part === 'look') setPart('details');
    else setStep('google');
  };

  const submitProfile = async () => {
    const displayName = name.trim();
    if (displayName.length < 2) {
      setPart('details');
      setError(t('activation.nameShort'));
      return;
    }
    if (!colorValid) {
      setPart('look');
      setError(t('activation.errColorFormat'));
      return;
    }
    setSaving(true);
    const result = await finishGoogleProfile(credential, displayName, {
      ...(photo.startsWith('data:image/jpeg') ? { avatarUrl: photo } : {}),
      ...(bio.trim() ? { bio: bio.trim() } : {}),
      ...(banner.startsWith('data:image/jpeg') ? { bannerUrl: banner } : {}),
      color,
      messageFont: font,
      avatarDecoration: decoration,
    });
    setSaving(false);
    if (result !== 'ok') {
      const connected = connectionError(result, t);
      if (connected) setError(connected);
      else if (result === 'username_taken') {
        setPart('details');
        setError(t('activation.nameTaken'));
      } else if (result === 'profile') setError(t('activation.profilePartial'));
      else {
        setError(t('activation.googleExpired'));
        setStep('google');
      }
      return;
    }
    navigate('/home', { replace: true });
  };

  return (
    <IonPage>
      <IonContent className="activation">
        <div className={step === 'profile' ? 'gate is-setup' : 'gate'}>
          <div className="gate-brand">
            <img src={brandLogo || DEFAULT_LOGO} alt="" width="96" height="96" decoding="async" />
            <strong dir="auto">{brandName(brandTitle)}</strong>
          </div>
          <LanguagePicker />
          <div className="gate-card">
            <span className="gate-dots" aria-hidden="true">
              <i className={step === 'google' ? 'on' : 'done'} />
              {PROFILE_PARTS.map((item) => <i key={item} className={step === 'profile' && item === part ? 'on' : step === 'profile' && PROFILE_PARTS.indexOf(item) < PROFILE_PARTS.indexOf(part) ? 'done' : ''} />)}
            </span>
            {step === 'google' ? (
              <div key="google-step">
                <h1>{t('activation.enter')}</h1>
                <p className="muted">{t('activation.lead')}</p>
                {CLIENT_ID ? (
                  <div className="google-login" aria-busy={connecting} style={connecting ? { pointerEvents: 'none', opacity: 0.65 } : undefined}>
                    <button type="button" className="google-login-face" tabIndex={-1} aria-hidden="true">
                      <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
                        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
                        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
                        <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.3 35.1 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.6 7.2l6.3 5.3C37.4 38.4 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
                      </svg>
                      {t('activation.google')}
                    </button>
                    <div ref={googleRef} className="google-slot" />
                  </div>
                ) : <p className="form-error">{t('activation.googleNotConfigured')}</p>}
                {connecting ? <p className="muted" role="status">{t('activation.signingIn')}</p> : null}
                {error ? <p className="form-error" role="alert">{error}</p> : null}
              </div>
            ) : (
              <div key="profile-step" className="account-setup">
                <h1>{part === 'details' ? t('activation.account') : part === 'look' ? t('activation.look') : t('activation.effects')}</h1>
                <p className="muted">{part === 'details' ? t('activation.leadDetails') : part === 'look' ? t('activation.leadLook') : t('activation.leadEffects')}</p>
                <div className="account-hero">
                  {part === 'details' ? (
                    <button type="button" className={banner ? 'account-cover is-photo' : 'account-cover'} style={{ '--banner': color } as CSSProperties} aria-label={t('activation.pickBanner')} onClick={() => bannerRef.current?.click()}>
                      {banner ? <img src={banner} alt="" /> : <span>{t('activation.addBanner')}</span>}
                    </button>
                  ) : (
                    <div className={banner ? 'account-cover is-photo' : 'account-cover'} style={{ '--banner': color } as CSSProperties}>
                      {banner ? <img src={banner} alt="" /> : null}
                    </div>
                  )}
                  {part === 'details' && banner ? (
                    <button type="button" className="account-cover-clear" aria-label={t('activation.removeBanner')} onClick={() => setBanner('')}>
                      {t('settings.remove')}
                    </button>
                  ) : null}
                  {part === 'details' ? (
                    <button type="button" className="photo-pick account-avatar" aria-label={t('activation.avatarPhoto')} onClick={() => photoRef.current?.click()}>
                      <Avatar name={name || '؟'} color={color} size={88} src={photo || undefined} decoration={decoration} animate={animate} />
                      <span className="photo-badge"><IonIcon icon={cameraOutline} /></span>
                    </button>
                  ) : (
                    <div className="account-avatar">
                      <Avatar name={name || '؟'} color={color} size={88} src={photo || undefined} decoration={decoration} animate={animate} />
                    </div>
                  )}
                </div>
                {part !== 'details' ? <strong className={displayNameStyleForUser(color, font).className} style={displayNameStyleForUser(color, font).style} dir="auto">{name.trim() || t('activation.previewName')}</strong> : null}
                <input ref={bannerRef} className="photo-file" type="file" accept="image/*" onChange={(event) => { void pickBanner(event.target.files?.[0]); event.target.value = ''; }} />
                <input ref={photoRef} className="photo-file" type="file" accept="image/*" onChange={(event) => { void pickPhoto(event.target.files?.[0]); event.target.value = ''; }} />
                <div key={part} className={animate ? 'account-setup-pane is-motion' : 'account-setup-pane'}>
                {part === 'details' ? (
                  <>
                    {remotePreview ? <p className="profile-style-hint">{t('activation.googlePhotoHint')}</p> : null}
                    {dataSaver && !photo ? <p className="profile-style-hint">{t('activation.dataSaverPhotoHint')}</p> : null}
                    <label className="gate-field">
                      <span className="field-line"><span>{t('activation.name')}</span><b>{name.trim().length}/40</b></span>
                      <input
                        ref={nameRef}
                        value={name}
                        dir="auto"
                        maxLength={40}
                        placeholder={t('activation.namePlaceholder')}
                        autoFocus
                        aria-label={t('activation.name')}
                        aria-invalid={name.trim().length > 0 && name.trim().length < 2}
                        aria-describedby="setup-name-hint"
                        onChange={(event) => { setName(event.target.value); setError(''); }}
                      />
                    </label>
                    <p id="setup-name-hint" className="profile-style-hint">{t('activation.nameHint')}</p>
                    <label className="gate-field">
                      <span className="field-line"><span>{t('activation.bioLabel')}</span><b>{bio.length}/160</b></span>
                      <textarea value={bio} dir="auto" maxLength={160} aria-label={t('activation.bioLabel')} placeholder={t('activation.bioPlaceholder')} onChange={(event) => { setBio(event.target.value); setError(''); }} />
                    </label>
                  </>
                ) : null}
                {part === 'look' ? (
                  <div className="profile-style-block">
                    <span className="profile-style-title">{t('activation.colorLabel')}</span>
                    <div className="look-colors profile-name-colors">
                      <label className="look-color">
                        {t('activation.color')}
                        <span className="look-chip" style={{ background: colorValid ? color : '#3d9b84' }}>
                          <input type="color" aria-label={t('activation.colorLabel')} value={colorValid ? color : '#3d9b84'} onChange={(event) => chooseColor(event.target.value.toLowerCase())} />
                        </span>
                      </label>
                      <label className="gate-field profile-hex">
                        <span>{t('activation.colorCode')}</span>
                        <input dir="ltr" maxLength={7} value={colorInput} aria-invalid={!colorValid} aria-label={t('activation.colorCode')} onChange={(event) => { setColorInput(event.target.value); setColor(normalizeUserColorInput(event.target.value, color)); setError(''); }} />
                      </label>
                    </div>
                    <span className="profile-style-title">{t('activation.font')}</span>
                    <div className="profile-font-grid" role="listbox" aria-label={t('activation.font')}>
                      {MESSAGE_FONT_OPTIONS.map((item) => (
                        <button key={item.id} type="button" role="option" aria-selected={font === item.id} className={[font === item.id ? 'is-on' : '', displayNameFontClass(item.id)].filter(Boolean).join(' ')} onClick={() => setFont(item.id)}>
                          {t(`font.${item.id}` as MessageKey)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {part === 'effects' ? (
                  <div className="profile-style-block">
                    <span className="profile-style-title">{t('activation.decor')}</span>
                    <p className="profile-style-hint">{t('activation.decorHint')}</p>
                    <div className="cosmetic-options" role="group" aria-label={t('activation.decor')}>
                      {AVATAR_DECORATIONS.map((item) => <button key={item.id} type="button" aria-pressed={decoration === item.id} className={decoration === item.id ? 'is-on' : ''} onClick={() => setDecoration(item.id)}><Avatar name={name || '؟'} color={color} size={48} src={photo || undefined} decoration={item.id} /><span>{t(`decor.${item.id}` as MessageKey)}</span></button>)}
                    </div>
                  </div>
                ) : null}
                </div>
                {error ? <p className="form-error" role="alert">{error}</p> : null}
                {part === 'effects' ? (
                  <button type="button" className="gate-go" disabled={saving} onClick={() => void submitProfile()}>{saving ? t('activation.saving') : t('activation.create')}</button>
                ) : (
                  <button type="button" className="gate-go" disabled={saving} onClick={continueProfile}>{t('activation.next')}</button>
                )}
                <button type="button" className="setup-back" disabled={saving} onClick={backProfile}>{t('activation.back')}</button>
              </div>
            )}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
}
