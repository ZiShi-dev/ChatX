import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { IonContent, IonHeader, IonIcon, IonPage } from '@ionic/react';
import { cameraOutline, logOutOutline, pencilOutline, settingsOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import PageNav from '../components/common/PageNav';
import Avatar from '../components/common/Avatar';
import { connectionLabel, getUserPresence } from '../lib/presence';
import { roleLabel } from '../lib/roles';
import { readBanner, readPhoto } from '../lib/photo';
import { displayNameFontClass, fontLabel, MESSAGE_FONT_OPTIONS, normalizeUserColorInput, USER_COLOR_OPTIONS } from '../lib/userStyle';
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
  const [draftFont, setDraftFont] = useState<MessageFontId>(currentUser.messageFont ?? 'system');
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
    setDraftColor(currentUser.color);
    setDraftFont(currentUser.messageFont ?? 'system');
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
    void scrollHold?.hold().then(() => photoRef.current?.click());
  };

  const pickBanner = () => {
    void scrollHold?.hold().then(() => bannerRef.current?.click());
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
    if (name.length < 2) return;
    void saveAccountProfile({
      displayName: name,
      bio: draftBio.trim(),
      color: draftColor,
      messageFont: draftFont,
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
            <Avatar name={currentUser.displayName} color={currentUser.color} size={96} src={currentUser.avatarUrl} />
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
          <h1>{currentUser.displayName}</h1>
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
            <div className="app-sheet profile-pop" role="dialog" onClick={(event) => event.stopPropagation()}>
              <span className="app-handle" />
              <h2>تعديل الملف</h2>
              <button type="button" className="photo-pick profile-photo" aria-label="تغيير الصورة" onClick={pickPhoto}>
                <Avatar name={displayName || currentUser.displayName} color={draftColor} size={72} src={currentUser.avatarUrl} />
                <span className="photo-badge">
                  <IonIcon icon={cameraOutline} />
                </span>
              </button>
              <label className="group-name">
                <span>الاسم</span>
                <input dir="auto" maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </label>
              <p className="profile-handle" dir="auto">@{currentUser.username}</p>
              <label className="group-name">
                <span>النبذة</span>
                <textarea dir="auto" maxLength={160} value={draftBio} placeholder="نبذة قصيرة" onChange={(event) => setDraftBio(event.target.value)} />
              </label>
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
                        onChange={(event) => setDraftColor(event.target.value.toLowerCase())}
                      />
                    </span>
                  </label>
                  <label className="group-name profile-hex">
                    <span>رمز اللون</span>
                    <input
                      dir="ltr"
                      maxLength={7}
                      value={draftColor}
                      aria-label="رمز اللون"
                      onChange={(event) => setDraftColor(normalizeUserColorInput(event.target.value, draftColor))}
                    />
                  </label>
                </div>
                <p className="profile-style-hint">ألوان سريعة</p>
                <div className="profile-color-grid" role="listbox" aria-label="لون الاسم">
                  {USER_COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      role="option"
                      aria-selected={draftColor === color}
                      className={draftColor === color ? 'is-on' : undefined}
                      style={{ '--swatch': color } as CSSProperties}
                      onClick={() => setDraftColor(color)}
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
              {saveError ? <p className="form-error">{saveError}</p> : null}
              <div className="account-actions">
                <button type="button" onClick={() => setEditing(false)}>إلغاء</button>
                <button type="button" className="profile-save" onClick={save}>حفظ</button>
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
