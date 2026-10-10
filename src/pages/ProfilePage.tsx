import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { IonContent, IonHeader, IonIcon, IonPage } from '@ionic/react';
import { cameraOutline, logOutOutline, pencilOutline, settingsOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import PageNav from '../components/common/PageNav';
import Avatar from '../components/common/Avatar';
import ProfileEffect from '../components/common/ProfileEffect';
import { useProfileMotion } from '../hooks/useProfileMotion';
import { AVATAR_DECORATIONS, PROFILE_EFFECTS, type AvatarDecoration, type ProfileEffectId } from '../lib/profileCosmetics';
import { connectionLabel, getUserPresence } from '../lib/presence';
import { roleLabel } from '../lib/roles';
import { readBanner, readPhoto } from '../lib/photo';
import { displayNameFontClass, displayNameStyleForUser, fontLabel, MESSAGE_FONT_OPTIONS, normalizeUserColorInput, USER_COLOR_OPTIONS } from '../lib/userStyle';
import type { MessageFontId } from '../types/user';
import { useAuthStore } from '../stores/authStore';

type ScrollHold = {
  hold: () => Promise<void>;
  restore: () => void;
  onPickerDismiss: () => void;
};

type ProfilePageProps = {
  embedded?: boolean;
  onShowSettings?: () => void;
  scrollHold?: ScrollHold;
};

export default function ProfilePage({ embedded = false, onShowSettings, scrollHold }: ProfilePageProps) {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const animate = useProfileMotion();
  const saveAccountProfile = useAuthStore((state) => state.saveAccountProfile);
  const logout = useAuthStore((state) => state.logout);
  const photoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [bannerPreview, setBannerPreview] = useState('');
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [draftBio, setDraftBio] = useState(currentUser.bio);
  const [draftColor, setDraftColor] = useState(currentUser.color);
  const [colorInput, setColorInput] = useState(currentUser.color);
  const colorValid = /^#?[0-9a-f]{6}$/i.test(colorInput);
  const chooseColor = (color: string) => { setDraftColor(color); setColorInput(color); };
  const [draftFont, setDraftFont] = useState<MessageFontId>(currentUser.messageFont ?? 'system');
  const [draftDecoration, setDraftDecoration] = useState<AvatarDecoration>(currentUser.avatarDecoration ?? 'none');
  const [draftEffect, setDraftEffect] = useState<ProfileEffectId>(currentUser.profileEffect ?? 'none');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!scrollHold) return;
    const onFocus = () => scrollHold.onPickerDismiss();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [scrollHold]);

  const openEditor = () => {
    setDisplayName(currentUser.displayName);
    setDraftBio(currentUser.bio);
    chooseColor(currentUser.color);
    setDraftFont(currentUser.messageFont ?? 'system');
    setDraftDecoration(currentUser.avatarDecoration ?? 'none');
    setDraftEffect(currentUser.profileEffect ?? 'none');
    setSaveError('');
    setEditing(true);
  };

  const reportSave = (saved: 'ok' | 'local' | 'offline' | 'invalid' | 'username_taken') => {
    if (saved === 'ok' || saved === 'local') {
      setSaveError('');
      return true;
    }
    if (saved === 'username_taken') setSaveError('هذا الاسم مستخدم.');
    else setSaveError(saved === 'offline' ? 'تعذر الاتصال. بقي التعديل على هذا الجهاز.' : 'تعذر حفظ الملف.');
    return false;
  };

  const pickPhoto = () => {
    if (scrollHold) void scrollHold.hold().then(() => photoRef.current?.click());
    else photoRef.current?.click();
  };

  const pickBanner = () => {
    if (scrollHold) void scrollHold.hold().then(() => bannerRef.current?.click());
    else bannerRef.current?.click();
  };

  const changePhoto = async (file?: File) => {
    if (!file) return;
    const avatarUrl = await readPhoto(file).catch(() => '');
    if (!avatarUrl) {
      setSaveError('تعذر حفظ الملف.');
      scrollHold?.restore();
      return;
    }
    reportSave(await saveAccountProfile({ avatarUrl }));
    scrollHold?.restore();
  };

  const changeBanner = async (file?: File) => {
    if (!file) return;
    const bannerUrl = await readBanner(file).catch(() => '');
    if (bannerUrl) setBannerPreview(bannerUrl);
    scrollHold?.restore();
  };

  const save = () => {
    const name = displayName.trim();
    if (name.length < 2 || !colorValid) return;
    void saveAccountProfile({
      displayName: name,
      bio: draftBio.trim(),
      color: draftColor,
      messageFont: draftFont,
      avatarDecoration: draftDecoration,
      profileEffect: draftEffect,
    }).then((saved) => {
      if (reportSave(saved)) setEditing(false);
    });
  };

  const openSettings = () => {
    if (onShowSettings) onShowSettings();
    else navigate('/account?tab=settings');
  };

  const body = (
    <>
      <div className="profile-frame">
        <section className="profile-hero">
          <ProfileEffect effect={currentUser.profileEffect} color={currentUser.color} />
          <div
            className={currentUser.bannerUrl ? 'profile-banner is-photo' : 'profile-banner'}
            style={{ '--banner': currentUser.color } as CSSProperties}
          >
            {currentUser.bannerUrl ? <img src={currentUser.bannerUrl} alt="" /> : null}
            <div className="banner-actions">
              <button type="button" className="banner-pick" aria-label="تغيير الغلاف" onClick={pickBanner}>
                <IonIcon icon={cameraOutline} />
                <span>الغلاف</span>
              </button>
              {currentUser.bannerUrl && (
                <button type="button" className="banner-pick" aria-label="إزالة الغلاف" onClick={() => void saveAccountProfile({ bannerUrl: null }).then(reportSave)}>
                  إزالة
                </button>
              )}
            </div>
            <input
              ref={bannerRef}
              className="photo-file"
              type="file"
              accept="image/*"
              onChange={(event) => {
                void changeBanner(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>
          <button type="button" className="photo-pick profile-photo" aria-label="تغيير الصورة" onClick={pickPhoto}>
            <Avatar name={currentUser.displayName} color={currentUser.color} size={96} src={currentUser.avatarUrl} decoration={currentUser.avatarDecoration} animate={animate} />
            <span className="photo-badge">
              <IonIcon icon={cameraOutline} />
            </span>
          </button>
          <input
            ref={photoRef}
            className="photo-file"
            type="file"
            accept="image/*"
            onChange={(event) => {
              void changePhoto(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <h1 {...displayNameStyleForUser(currentUser.color, currentUser.messageFont)} dir="auto">{currentUser.displayName}</h1>
          <p className="profile-handle" dir="auto">@{currentUser.username}</p>
          {saveError ? <p className="form-error">{saveError}</p> : null}
        </section>
        <dl className="account-facts">
          <div>
            <dt>الدور</dt>
            <dd>{roleLabel(currentUser.role) || 'عضو'}</dd>
          </div>
          <div>
            <dt>الحالة</dt>
            <dd className="profile-status">
              <i className={getUserPresence(currentUser.id, [currentUser]) === 'online' ? 'on' : ''} />
              {connectionLabel(currentUser, { self: true })}
            </dd>
          </div>
          <div>
            <dt>لون الاسم</dt>
            <dd className="profile-style-swatch" style={{ '--style-color': currentUser.color } as CSSProperties}>
              <span aria-hidden="true" />
            </dd>
          </div>
          <div>
            <dt>خط الاسم</dt>
            <dd>{fontLabel(currentUser.messageFont)}</dd>
          </div>
        </dl>
        <section className="profile-bio">
          <span>النبذة</span>
          {currentUser.bio ? (
            <p dir="auto">{currentUser.bio}</p>
          ) : (
            <button type="button" className="group-bio-add" onClick={openEditor}>أضف نبذة</button>
          )}
        </section>
        <section className="profile-actions">
          <button type="button" onClick={openEditor}>
            <IonIcon icon={pencilOutline} />
            <span>تعديل الملف</span>
          </button>
          {!embedded && (
            <button type="button" onClick={openSettings}>
              <IonIcon icon={settingsOutline} />
              <span>الإعدادات</span>
            </button>
          )}
          <button type="button" className="is-leave" onClick={() => setConfirmLeave(true)}>
            <IonIcon icon={logOutOutline} />
            <span>تسجيل الخروج</span>
          </button>
        </section>
      </div>
      {confirmLeave &&
        createPortal(
          <div className="wa-scrim center" onClick={() => setConfirmLeave(false)}>
            <div className="account-dialog" role="alertdialog" onClick={(event) => event.stopPropagation()}>
              <h2>تسجيل الخروج؟</h2>
              <p className="account-warn">ستعود إلى شاشة الدخول. الرمز نفسه يعيدك ما دام نشطًا.</p>
              <div className="account-actions">
                <button type="button" onClick={() => setConfirmLeave(false)}>إلغاء</button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    logout();
                    navigate('/activation', { replace: true });
                  }}
                >
                  تسجيل الخروج
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      {editing &&
        createPortal(
          <div className="app-scrim sheet" onClick={() => setEditing(false)}>
            <div className="app-sheet profile-pop profile-editor" role="dialog" aria-label="تعديل الملف" onClick={(event) => event.stopPropagation()}>
              <span className="app-handle" />
              <h2>تعديل الملف</h2>
              <div className="cosmetic-preview" aria-label="معاينة مظهر الملف">
                <ProfileEffect effect={draftEffect} color={draftColor} />
                <Avatar name={displayName || currentUser.displayName} color={draftColor} size={64} src={currentUser.avatarUrl} decoration={draftDecoration} animate={animate} />
                <strong {...displayNameStyleForUser(draftColor, draftFont)} dir="auto">{displayName || currentUser.displayName}</strong>
              </div>
              <section className="profile-editor-section"><h3>المعلومات الشخصية</h3>
              <button type="button" className="profile-photo-action" onClick={pickPhoto}><IonIcon icon={cameraOutline} /> تغيير الصورة</button>
              <label className="group-name">
                <span>الاسم</span>
                <input dir="auto" maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </label>
              <p className="profile-handle" dir="auto">@{currentUser.username}</p>
              <label className="group-name">
                <span>النبذة</span>
                <textarea dir="auto" maxLength={160} value={draftBio} placeholder="نبذة قصيرة" onChange={(event) => setDraftBio(event.target.value)} />
              </label>
              </section>
              <section className="profile-editor-section"><h3>مظهر الاسم</h3>
              <div className="profile-style-block">
                <span className="profile-style-title">لون الاسم</span>
                <p className="profile-style-hint">اختر أي لون، مثل مظهر التطبيق. يظهر اسمك في المجموعات للجميع.</p>
                <div className="look-colors profile-name-colors">
                  <label className="look-color">
                    لونك
                    <span className="look-chip" style={{ background: draftColor }}>
                      <input
                        type="color"
                        aria-label="لون الاسم"
                        value={draftColor}
                        onChange={(event) => chooseColor(event.target.value.toLowerCase())}
                      />
                    </span>
                  </label>
                  <label className="group-name profile-hex">
                    <span>رمز اللون</span>
                    <input
                      dir="ltr"
                      maxLength={7}
                      value={colorInput}
                      aria-invalid={!colorValid}
                      aria-label="رمز اللون"
                      onChange={(event) => { setColorInput(event.target.value); setDraftColor(normalizeUserColorInput(event.target.value, draftColor)); }}
                    />
                  </label>
                </div>
                {!colorValid && <p className="form-error">اكتب ستة أحرف للون، مثل #3d9b84.</p>}
                <p className="profile-style-hint">ألوان سريعة</p>
                <div className="profile-color-grid" role="listbox" aria-label="لون الاسم">
                  {USER_COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      role="option"
                      aria-selected={draftColor === color}
                      aria-label={color}
                      className={draftColor === color ? 'is-on' : undefined}
                      style={{ '--swatch': color } as CSSProperties}
                      onClick={() => chooseColor(color)}
                    >
                      <span aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="profile-style-block">
                <span className="profile-style-title">خط الاسم</span>
                <p className="profile-style-hint">نفس الخط لاسمك في المجموعات. نص الرسالة يبقى بخط التطبيق.</p>
                <div className="profile-font-grid" role="listbox" aria-label="خط الاسم">
                  {MESSAGE_FONT_OPTIONS.map((font) => (
                    <button
                      key={font.id}
                      type="button"
                      role="option"
                      aria-selected={draftFont === font.id}
                      className={[draftFont === font.id ? 'is-on' : '', displayNameFontClass(font.id)].filter(Boolean).join(' ')}
                      onClick={() => setDraftFont(font.id)}
                    >
                      {font.label}
                    </button>
                  ))}
                </div>
              </div>
              </section>
              <section className="profile-editor-section"><h3>الزينة والتأثيرات</h3>
              <div className="profile-style-block">
                <span className="profile-style-title">زينة الصورة</span>
                <p className="profile-style-hint">اختر الزينة أو أزلها. القبعة تتحرك داخل الملف فقط، وتبقى ثابتة في وضع التوفير وعلى الأجهزة الضعيفة.</p>
                <div className="cosmetic-options" role="group" aria-label="زينة الصورة">
                  {AVATAR_DECORATIONS.map(item => <button key={item.id} type="button" aria-pressed={draftDecoration === item.id} className={draftDecoration === item.id ? 'is-on' : ''} onClick={() => setDraftDecoration(item.id)}>{item.label}</button>)}
                </div>
                <span className="profile-style-title">تأثير الملف</span>
                <div className="cosmetic-options" role="group" aria-label="تأثير الملف">
                  {PROFILE_EFFECTS.map(item => <button key={item.id} type="button" aria-pressed={draftEffect === item.id} className={draftEffect === item.id ? 'is-on' : ''} onClick={() => setDraftEffect(item.id)}>{item.label}</button>)}
                </div>
              </div>
              </section>
              {saveError ? <p className="form-error">{saveError}</p> : null}
              <div className="account-actions profile-editor-footer">
                <button type="button" onClick={() => setEditing(false)}>إلغاء</button>
                <button type="button" className="profile-save" disabled={!colorValid || displayName.trim().length < 2} onClick={save}>حفظ</button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      {bannerPreview &&
        createPortal(
          <div className="app-scrim sheet" onClick={() => setBannerPreview('')}>
            <div className="app-sheet" role="dialog" aria-labelledby="banner-preview-title" onClick={(event) => event.stopPropagation()}>
              <span className="app-handle" />
              <h2 id="banner-preview-title">معاينة الغلاف</h2>
              <img className="banner-preview" src={bannerPreview} alt="" />
              <div className="account-actions">
                <button type="button" onClick={() => setBannerPreview('')}>إلغاء</button>
                <button
                  type="button"
                  className="profile-save"
                  onClick={() => {
                    void saveAccountProfile({ bannerUrl: bannerPreview }).then((saved) => {
                      if (reportSave(saved)) setBannerPreview('');
                      scrollHold?.restore();
                    });
                  }}
                >
                  استخدام الغلاف
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );

  if (embedded) return body;

  return (
    <IonPage>
      <IonHeader>
        <NetworkStatusBanner />
        <PageNav title="الملف الشخصي" fallback="/home" />
      </IonHeader>
      <IonContent className="profile-page">{body}</IonContent>
    </IonPage>
  );
}
