import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { IonContent, IonHeader, IonIcon, IonPage } from '@ionic/react';
import { cameraOutline, logOutOutline, pencilOutline, settingsOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import PageNav from '../components/common/PageNav';
import Avatar from '../components/common/Avatar';
import CustomRoleBadge from '../components/common/CustomRoleBadge';
import NameColorField from '../components/common/NameColorField';
import ProfileEffect from '../components/common/ProfileEffect';
import { useProfileMotion } from '../hooks/useProfileMotion';
import { AVATAR_DECORATIONS, PROFILE_EFFECTS, type AvatarDecoration, type ProfileEffectId } from '../lib/profileCosmetics';
import { connectionLabel, getUserPresence } from '../lib/presence';
import { roleLabel } from '../lib/roles';
import { readBanner, readPhoto } from '../lib/photo';
import { CUSTOM_ROLE_COLORS_MAX, sanitizeCustomRoleLabel } from '../lib/customRole';
import { displayNameFontClass, displayNameStyleForUser, fontLabel, MESSAGE_FONT_OPTIONS, sanitizeUserColor } from '../lib/userStyle';
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
  const [editorTab, setEditorTab] = useState<'details' | 'name' | 'effects'>('details');
  const editorFields = useRef<HTMLDivElement>(null);
  const editorDialog = useRef<HTMLDivElement>(null);
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
  const [draftRoleLabel, setDraftRoleLabel] = useState(currentUser.customRoleLabel ?? '');
  const [draftRoleColors, setDraftRoleColors] = useState<string[]>(() => (
    currentUser.customRoleColors?.length ? [...currentUser.customRoleColors] : [currentUser.color || '#3d9b84']
  ));
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!scrollHold) return;
    const onFocus = () => scrollHold.onPickerDismiss();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [scrollHold]);

  useEffect(() => {
    if (!editing) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => editorDialog.current?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setEditing(false); return; }
      if (event.key !== 'Tab') return;
      const controls = [...(editorDialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])].filter(node => node.getClientRects().length > 0 && node.tabIndex >= 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [editing]);

  const openEditor = () => {
    setDisplayName(currentUser.displayName);
    setDraftBio(currentUser.bio);
    chooseColor(currentUser.color);
    setDraftFont(currentUser.messageFont ?? 'system');
    setDraftDecoration(currentUser.avatarDecoration ?? 'none');
    setDraftEffect(currentUser.profileEffect ?? 'none');
    setDraftRoleLabel(currentUser.customRoleLabel ?? '');
    setDraftRoleColors(currentUser.customRoleColors?.length ? [...currentUser.customRoleColors] : [currentUser.color || '#3d9b84']);
    setSaveError('');
    setEditorTab('details');
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
    else setSaveError('تعذر حفظ الملف.');
    scrollHold?.restore();
  };

  const save = () => {
    const name = displayName.trim();
    const roleLabel = sanitizeCustomRoleLabel(draftRoleLabel);
    const roleColors = draftRoleColors.map((item) => sanitizeUserColor(item, '#3d9b84')).filter((item, index, list) => list.indexOf(item) === index);
    if (name.length < 2 || !colorValid) return;
    if (roleLabel && roleColors.length === 0) {
      setSaveError('أضف لونًا واحدًا على الأقل للدور.');
      return;
    }
    void saveAccountProfile({
      displayName: name,
      bio: draftBio.trim(),
      color: draftColor,
      messageFont: draftFont,
      avatarDecoration: draftDecoration,
      profileEffect: draftEffect,
      customRoleLabel: roleLabel || null,
      customRoleColors: roleLabel ? roleColors : null,
    }).then((saved) => {
      if (reportSave(saved)) setEditing(false);
    });
  };

  const openSettings = () => {
    if (onShowSettings) onShowSettings();
    else navigate('/account?tab=settings', { replace: true });
  };

  const body = (
    <>
      <div className="profile-frame">
        <ProfileEffect effect={currentUser.profileEffect} color={currentUser.color} />
        <section className="profile-hero">
          <div
            className={currentUser.bannerUrl ? 'profile-banner is-photo' : 'profile-banner'}
            style={{ '--banner': currentUser.color } as CSSProperties}
          >
            {currentUser.bannerUrl ? <img src={currentUser.bannerUrl} alt="" /> : null}
          </div>
          <div className="profile-photo">
            <Avatar name={currentUser.displayName} color={currentUser.color} size={96} src={currentUser.avatarUrl} decoration={currentUser.avatarDecoration} animate={animate} />
          </div>
          <h1 {...displayNameStyleForUser(currentUser.color, currentUser.messageFont)} dir="auto">{currentUser.displayName}</h1>
          <p className="profile-handle" dir="auto">@{currentUser.username}</p>
          <p className="member-chips profile-role-row">
            <CustomRoleBadge user={currentUser} />
            {roleLabel(currentUser.role) ? <span className="kind-pill">{roleLabel(currentUser.role)}</span> : null}
          </p>
        </section>
        <dl className="account-facts">
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
          <div className="app-scrim sheet profile-editor-scrim" onClick={() => setEditing(false)}>
            <div ref={editorDialog} className="app-sheet profile-pop profile-editor" role="dialog" aria-modal="true" aria-label="تعديل الملف" onClick={(event) => event.stopPropagation()}>
              <div className="profile-editor-header"><span className="app-handle" />
              <h2>تعديل الملف</h2>
              <div className="profile-editor-preview">
                <ProfileEffect effect={draftEffect} color={draftColor} />
                <div className="profile-editor-banner" style={{ '--banner': draftColor } as CSSProperties}>
                  {currentUser.bannerUrl ? <img src={currentUser.bannerUrl} alt="" /> : null}
                </div>
              <div className="cosmetic-preview" aria-label="معاينة مظهر الملف">
                <Avatar name={displayName || currentUser.displayName} color={draftColor} size={80} src={currentUser.avatarUrl} decoration={draftDecoration} animate={animate} />
                <strong {...displayNameStyleForUser(draftColor, draftFont)} dir="auto">{displayName || currentUser.displayName}</strong>
              </div>
              </div>
              </div>
              <div className="profile-editor-tabs" role="tablist" aria-label="أقسام تعديل الملف" onKeyDown={event => {
                const tabs = ['details', 'name', 'effects'] as const;
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : event.key === 'ArrowLeft' ? (tabs.indexOf(editorTab) + 1) % 3 : event.key === 'ArrowRight' ? (tabs.indexOf(editorTab) + 2) % 3 : -1;
                if (next < 0) return;
                event.preventDefault(); setEditorTab(tabs[next]); editorFields.current?.scrollTo(0, 0);
                document.getElementById('profile-tab-' + tabs[next])?.focus();
              }}>
                {([{ id: 'details', label: 'المعلومات' }, { id: 'name', label: 'الاسم والألوان' }, { id: 'effects', label: 'الزينة والتأثيرات' }] as const).map(tab => <button type="button" key={tab.id} id={'profile-tab-' + tab.id} role="tab" aria-selected={editorTab === tab.id} aria-controls={'profile-panel-' + tab.id} tabIndex={editorTab === tab.id ? 0 : -1} onClick={() => { setEditorTab(tab.id); editorFields.current?.scrollTo(0, 0); }}>{tab.label}</button>)}
              </div>
              <div className="profile-editor-fields" ref={editorFields}>
              <section id="profile-panel-details" role="tabpanel" aria-labelledby="profile-tab-details" hidden={editorTab !== 'details'} className="profile-editor-section"><h3>المعلومات الشخصية</h3>
              <div className="profile-media-actions">
                <button type="button" className="profile-photo-action" onClick={pickPhoto}><IonIcon icon={cameraOutline} /> تغيير الصورة</button>
                <button type="button" className="profile-photo-action" onClick={pickBanner}><IonIcon icon={cameraOutline} /> تغيير الغلاف</button>
                {currentUser.bannerUrl ? <button type="button" className="profile-photo-action" onClick={() => void saveAccountProfile({ bannerUrl: null }).then(reportSave)}>إزالة الغلاف</button> : null}
              </div>
              <input ref={photoRef} className="photo-file" type="file" accept="image/*" onChange={(event) => { void changePhoto(event.target.files?.[0]); event.target.value = ''; }} />
              <input ref={bannerRef} className="photo-file" type="file" accept="image/*" onChange={(event) => { void changeBanner(event.target.files?.[0]); event.target.value = ''; }} />
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
              <section id="profile-panel-name" role="tabpanel" aria-labelledby="profile-tab-name" hidden={editorTab !== 'name'} className="profile-editor-section"><h3>مظهر الاسم والدور</h3>
              <NameColorField
                color={draftColor}
                colorInput={colorInput}
                onColor={chooseColor}
                onInput={setColorInput}
                hint="يظهر اسمك في المجموعات للجميع."
              />
              <div className="profile-style-block">
                <span className="profile-style-title">دورك (مخصص)</span>
                <p className="profile-style-hint">مثل Discord: اسم الدور يظهر في ملفك للجميع. يمكنك إضافة حتى {CUSTOM_ROLE_COLORS_MAX} ألوان.</p>
                <label className="group-name">
                  <span>اسم الدور</span>
                  <input
                    dir="auto"
                    maxLength={32}
                    value={draftRoleLabel}
                    placeholder="مثال: حارس المجموعة"
                    onChange={(event) => setDraftRoleLabel(event.target.value)}
                  />
                </label>
                <div className="custom-role-colors">
                  {draftRoleColors.map((hex, index) => (
                    <label key={index} className="look-color">
                      لون {index + 1}
                      <span className="look-chip" style={{ background: hex } as CSSProperties}>
                        <input
                          type="color"
                          aria-label={`لون الدور ${index + 1}`}
                          value={hex}
                          onChange={(event) => {
                            const next = [...draftRoleColors];
                            next[index] = event.target.value.toLowerCase();
                            setDraftRoleColors(next);
                          }}
                        />
                      </span>
                    </label>
                  ))}
                </div>
                <div className="profile-editor-actions">
                  {draftRoleColors.length < CUSTOM_ROLE_COLORS_MAX && (
                    <button type="button" onClick={() => setDraftRoleColors([...draftRoleColors, draftRoleColors.at(-1) ?? '#3d9b84'])}>
                      إضافة لون
                    </button>
                  )}
                  {draftRoleColors.length > 1 && (
                    <button type="button" onClick={() => setDraftRoleColors(draftRoleColors.slice(0, -1))}>
                      إزالة آخر لون
                    </button>
                  )}
                </div>
                {sanitizeCustomRoleLabel(draftRoleLabel) && (
                  <p className="profile-style-hint">معاينة:</p>
                )}
                {sanitizeCustomRoleLabel(draftRoleLabel) && (
                  <CustomRoleBadge user={{ customRoleLabel: sanitizeCustomRoleLabel(draftRoleLabel), customRoleColors: draftRoleColors }} />
                )}
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
              <section id="profile-panel-effects" role="tabpanel" aria-labelledby="profile-tab-effects" hidden={editorTab !== 'effects'} className="profile-editor-section"><h3>الزينة والتأثيرات</h3>
              <div className="profile-style-block">
                <span className="profile-style-title">زينة الصورة</span>
                <p className="profile-style-hint">اختر زينة للصورة وتأثيرًا للملف. المعاينة تبقى أمامك، والحركة تتوقف في وضع التوفير وعلى الأجهزة الضعيفة.</p>
                <div className="cosmetic-options" role="group" aria-label="زينة الصورة">
                  {AVATAR_DECORATIONS.map(item => <button key={item.id} type="button" aria-pressed={draftDecoration === item.id} className={draftDecoration === item.id ? 'is-on' : ''} onClick={() => setDraftDecoration(item.id)}><Avatar name={displayName || currentUser.displayName} color={draftColor} size={48} src={currentUser.avatarUrl} decoration={item.id} /><span>{item.label}</span></button>)}
                </div>
                <span className="profile-style-title">تأثير الملف</span>
                <div className="cosmetic-options" role="group" aria-label="تأثير الملف">
                  {PROFILE_EFFECTS.map(item => <button key={item.id} type="button" aria-pressed={draftEffect === item.id} className={draftEffect === item.id ? 'is-on' : ''} onClick={() => setDraftEffect(item.id)}>{item.label}</button>)}
                </div>
              </div>
              </section>
              </div>
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
              {saveError ? <p className="form-error">{saveError}</p> : null}
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
