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
import { useProfileMotion } from '../hooks/useProfileMotion';
import { AVATAR_DECORATIONS, type AvatarDecoration } from '../lib/profileCosmetics';
import { useI18n, type MessageKey } from '../lib/i18n';
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
  const { t } = useI18n();
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
    if (saved === 'username_taken') setSaveError(t('profile.errUsernameTaken'));
    else setSaveError(saved === 'offline' ? t('profile.errOfflineLocal') : t('profile.errSaveFailed'));
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
      setSaveError(t('profile.errFileSave'));
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
    else setSaveError(t('profile.errFileSave'));
    scrollHold?.restore();
  };

  const save = () => {
    const name = displayName.trim();
    const roleLabel = sanitizeCustomRoleLabel(draftRoleLabel);
    const roleColors = draftRoleColors.map((item) => sanitizeUserColor(item, '#3d9b84')).filter((item, index, list) => list.indexOf(item) === index);
    if (name.length < 2 || !colorValid) return;
    if (roleLabel && roleColors.length === 0) {
      setSaveError(t('profile.errRoleColor'));
      return;
    }
    void saveAccountProfile({
      displayName: name,
      bio: draftBio.trim(),
      color: draftColor,
      messageFont: draftFont,
      avatarDecoration: draftDecoration,
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
            <dt>{t('profile.status')}</dt>
            <dd className="profile-status">
              <i className={getUserPresence(currentUser.id, [currentUser]) === 'online' ? 'on' : ''} />
              {connectionLabel(currentUser, { self: true })}
            </dd>
          </div>
          <div>
            <dt>{t('profile.nameColor')}</dt>
            <dd className="profile-style-swatch" style={{ '--style-color': currentUser.color } as CSSProperties}>
              <span aria-hidden="true" />
            </dd>
          </div>
          <div>
            <dt>{t('profile.font')}</dt>
            <dd>{fontLabel(currentUser.messageFont)}</dd>
          </div>
        </dl>
        <section className="profile-bio">
          <span>{t('profile.bioSection')}</span>
          {currentUser.bio ? (
            <p dir="auto">{currentUser.bio}</p>
          ) : (
            <button type="button" className="group-bio-add" onClick={openEditor}>{t('profile.addBio')}</button>
          )}
        </section>
        <section className="profile-actions">
          <button type="button" onClick={openEditor}>
            <IonIcon icon={pencilOutline} />
            <span>{t('profile.editProfile')}</span>
          </button>
          {!embedded && (
            <button type="button" onClick={openSettings}>
              <IonIcon icon={settingsOutline} />
              <span>{t('profile.settings')}</span>
            </button>
          )}
          <button type="button" className="is-leave" onClick={() => setConfirmLeave(true)}>
            <IonIcon icon={logOutOutline} />
            <span>{t('profile.logOut')}</span>
          </button>
        </section>
      </div>
      {confirmLeave &&
        createPortal(
          <div className="wa-scrim center" onClick={() => setConfirmLeave(false)}>
            <div className="account-dialog" role="alertdialog" onClick={(event) => event.stopPropagation()}>
              <h2>{t('profile.logOutTitle')}</h2>
              <p className="account-warn">{t('profile.logOutBody')}</p>
              <div className="account-actions">
                <button type="button" onClick={() => setConfirmLeave(false)}>{t('profile.cancel')}</button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    logout();
                    navigate('/activation', { replace: true });
                  }}
                >
                  {t('profile.logOutConfirm')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      {editing &&
        createPortal(
          <div className="app-scrim sheet profile-editor-scrim" onClick={() => setEditing(false)}>
            <div ref={editorDialog} className="app-sheet profile-pop profile-editor" role="dialog" aria-modal="true" aria-label={t('profile.editorTitle')} onClick={(event) => event.stopPropagation()}>
              <div className="profile-editor-header"><span className="app-handle" />
              <h2>{t('profile.editorTitle')}</h2>
              <div className="profile-editor-preview">
                <div className="profile-editor-banner" style={{ '--banner': draftColor } as CSSProperties}>
                  {currentUser.bannerUrl ? <img src={currentUser.bannerUrl} alt="" /> : null}
                </div>
              <div className="cosmetic-preview" aria-label={t('profile.previewAria')}>
                <Avatar name={displayName || currentUser.displayName} color={draftColor} size={80} src={currentUser.avatarUrl} decoration={draftDecoration} animate={animate} />
                <strong {...displayNameStyleForUser(draftColor, draftFont)} dir="auto">{displayName || currentUser.displayName}</strong>
              </div>
              </div>
              </div>
              <div className="profile-editor-tabs" role="tablist" aria-label={t('profile.editorAriaTabs')} onKeyDown={event => {
                const tabs = ['details', 'name', 'effects'] as const;
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : event.key === 'ArrowLeft' ? (tabs.indexOf(editorTab) + 1) % 3 : event.key === 'ArrowRight' ? (tabs.indexOf(editorTab) + 2) % 3 : -1;
                if (next < 0) return;
                event.preventDefault(); setEditorTab(tabs[next]); editorFields.current?.scrollTo(0, 0);
                document.getElementById('profile-tab-' + tabs[next])?.focus();
              }}>
                {([{ id: 'details' as const, labelKey: 'profile.tabDetails' as MessageKey }, { id: 'name' as const, labelKey: 'profile.tabNameColors' as MessageKey }, { id: 'effects' as const, labelKey: 'profile.tabEffects' as MessageKey }]).map(tab => <button type="button" key={tab.id} id={'profile-tab-' + tab.id} role="tab" aria-selected={editorTab === tab.id} aria-controls={'profile-panel-' + tab.id} tabIndex={editorTab === tab.id ? 0 : -1} onClick={() => { setEditorTab(tab.id); editorFields.current?.scrollTo(0, 0); }}>{t(tab.labelKey)}</button>)}
              </div>
              <div className="profile-editor-fields" ref={editorFields}>
              <section id="profile-panel-details" role="tabpanel" aria-labelledby="profile-tab-details" hidden={editorTab !== 'details'} className="profile-editor-section"><h3>{t('profile.personalInfo')}</h3>
              <div className="profile-media-actions">
                <button type="button" className="profile-photo-action" onClick={pickPhoto}><IonIcon icon={cameraOutline} /> {t('profile.changePhoto')}</button>
                <button type="button" className="profile-photo-action" onClick={pickBanner}><IonIcon icon={cameraOutline} /> {t('profile.changeBanner')}</button>
                {currentUser.bannerUrl ? <button type="button" className="profile-photo-action" onClick={() => void saveAccountProfile({ bannerUrl: null }).then(reportSave)}>{t('profile.removeBanner')}</button> : null}
              </div>
              <input ref={photoRef} className="photo-file" type="file" accept="image/*" onChange={(event) => { void changePhoto(event.target.files?.[0]); event.target.value = ''; }} />
              <input ref={bannerRef} className="photo-file" type="file" accept="image/*" onChange={(event) => { void changeBanner(event.target.files?.[0]); event.target.value = ''; }} />
              <label className="group-name">
                <span>{t('profile.nameLabel')}</span>
                <input dir="auto" maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </label>
              <p className="profile-handle" dir="auto">@{currentUser.username}</p>
              <label className="group-name">
                <span>{t('profile.bioLabel')}</span>
                <textarea dir="auto" maxLength={160} value={draftBio} placeholder={t('profile.bioPlaceholderShort')} onChange={(event) => setDraftBio(event.target.value)} />
              </label>
              </section>
              <section id="profile-panel-name" role="tabpanel" aria-labelledby="profile-tab-name" hidden={editorTab !== 'name'} className="profile-editor-section"><h3>{t('profile.nameAndRoleTitle')}</h3>
              <NameColorField
                color={draftColor}
                colorInput={colorInput}
                onColor={chooseColor}
                onInput={setColorInput}
                hint={t('profile.nameColorHint')}
              />
              <div className="profile-style-block">
                <span className="profile-style-title">{t('profile.customRoleTitle')}</span>
                <p className="profile-style-hint">{t('profile.customRoleHint', { max: CUSTOM_ROLE_COLORS_MAX })}</p>
                <label className="group-name">
                  <span>{t('profile.roleNameLabel')}</span>
                  <input
                    dir="auto"
                    maxLength={32}
                    value={draftRoleLabel}
                    placeholder={t('profile.roleNamePlaceholder')}
                    onChange={(event) => setDraftRoleLabel(event.target.value)}
                  />
                </label>
                <div className="custom-role-colors">
                  {draftRoleColors.map((hex, index) => (
                    <label key={index} className="look-color">
                      {t('profile.roleColor', { index: index + 1 })}
                      <span className="look-chip" style={{ background: hex } as CSSProperties}>
                        <input
                          type="color"
                          aria-label={t('profile.roleColorAria', { index: index + 1 })}
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
                      {t('profile.addColor')}
                    </button>
                  )}
                  {draftRoleColors.length > 1 && (
                    <button type="button" onClick={() => setDraftRoleColors(draftRoleColors.slice(0, -1))}>
                      {t('profile.removeLastColor')}
                    </button>
                  )}
                </div>
                {sanitizeCustomRoleLabel(draftRoleLabel) && (
                  <p className="profile-style-hint">{t('profile.previewLabel')}</p>
                )}
                {sanitizeCustomRoleLabel(draftRoleLabel) && (
                  <CustomRoleBadge user={{ customRoleLabel: sanitizeCustomRoleLabel(draftRoleLabel), customRoleColors: draftRoleColors }} />
                )}
              </div>
              <div className="profile-style-block">
                <span className="profile-style-title">{t('profile.font')}</span>
                <p className="profile-style-hint">{t('profile.fontHint')}</p>
                <div className="profile-font-grid" role="listbox" aria-label={t('profile.font')}>
                  {MESSAGE_FONT_OPTIONS.map((font) => (
                    <button
                      key={font.id}
                      type="button"
                      role="option"
                      aria-selected={draftFont === font.id}
                      className={[draftFont === font.id ? 'is-on' : '', displayNameFontClass(font.id)].filter(Boolean).join(' ')}
                      onClick={() => setDraftFont(font.id)}
                    >
                      {t(`font.${font.id}` as MessageKey)}
                    </button>
                  ))}
                </div>
              </div>
              </section>
              <section id="profile-panel-effects" role="tabpanel" aria-labelledby="profile-tab-effects" hidden={editorTab !== 'effects'} className="profile-editor-section"><h3>{t('profile.decor')}</h3>
              <div className="profile-style-block">
                <span className="profile-style-title">{t('profile.decorTitle')}</span>
                <p className="profile-style-hint">{t('profile.decorHint')}</p>
                <div className="cosmetic-options" role="group" aria-label={t('profile.decorTitle')}>
                  {AVATAR_DECORATIONS.map(item => <button key={item.id} type="button" aria-pressed={draftDecoration === item.id} className={draftDecoration === item.id ? 'is-on' : ''} onClick={() => setDraftDecoration(item.id)}><Avatar name={displayName || currentUser.displayName} color={draftColor} size={48} src={currentUser.avatarUrl} decoration={item.id} /><span>{t(`decor.${item.id}` as MessageKey)}</span></button>)}
                </div>
              </div>
              </section>
              </div>
              {saveError ? <p className="form-error">{saveError}</p> : null}
              <div className="account-actions profile-editor-footer">
                <button type="button" onClick={() => setEditing(false)}>{t('profile.cancel')}</button>
                <button type="button" className="profile-save" disabled={!colorValid || displayName.trim().length < 2} onClick={save}>{t('profile.save')}</button>
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
              <h2 id="banner-preview-title">{t('profile.bannerPreviewTitle')}</h2>
              <img className="banner-preview" src={bannerPreview} alt="" />
              {saveError ? <p className="form-error">{saveError}</p> : null}
              <div className="account-actions">
                <button type="button" onClick={() => setBannerPreview('')}>{t('profile.cancel')}</button>
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
                  {t('profile.useBanner')}
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
        <PageNav title={t('profile.title')} fallback="/home" />
      </IonHeader>
      <IonContent className="profile-page">{body}</IonContent>
    </IonPage>
  );
}
