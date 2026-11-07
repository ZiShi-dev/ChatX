import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { IonContent, IonHeader, IonPage, IonToggle } from '@ionic/react';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import NotificationPermissionCard from '../components/common/NotificationPermission';
import PushConnectionCard from '../components/common/PushConnectionCard';
import PageNav from '../components/common/PageNav';
import { APPEARANCE_PRESETS, DEFAULT_LOGO, logoFromFile, wallpaperFromFile } from '../lib/appearance';
import { notificationPresentation, type InboxKind } from '../lib/inbox';
import { AdminApiError, adminFetch } from '../lib/adminApi';
import { formatBytes } from '../lib/media';
import { isSafeExternalUrl } from '../lib/url';
import LanguagePicker from '../components/common/LanguagePicker';
import { useI18n, type MessageKey } from '../lib/i18n';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { ImageQuality, VideoQuality } from '../types/settings';

const imageChoices: Array<{ value: ImageQuality; label: MessageKey; hint: MessageKey }> = [
  { value: 'saver', label: 'quality.saver', hint: 'quality.saverHint' },
  { value: 'medium', label: 'quality.medium', hint: 'quality.mediumHint' },
  { value: 'original', label: 'quality.high', hint: 'quality.highHint' },
  { value: 'hd', label: 'quality.hd', hint: 'quality.hdHint' },
];

const videoChoices: Array<{ value: VideoQuality; label: string; hint: MessageKey }> = [
  { value: '480', label: '480p', hint: 'quality.videoHint' },
  { value: '720', label: '720p', hint: 'quality.videoHint' },
  { value: 'original', label: 'original', hint: 'quality.videoHint' },
];

type SettingsPageProps = { embedded?: boolean };
type SettingsSection = 'look' | 'privacy' | 'alerts' | 'receive' | 'send' | 'storage' | 'account';

const settingsSections: Array<{ id: SettingsSection; label: MessageKey }> = [
  { id: 'look', label: 'settings.look' },
  { id: 'privacy', label: 'settings.privacy' },
  { id: 'alerts', label: 'settings.alerts' },
  { id: 'receive', label: 'settings.receive' },
  { id: 'send', label: 'settings.send' },
  { id: 'storage', label: 'settings.storage' },
  { id: 'account', label: 'settings.account' },
];

function scrollSettings(node: HTMLElement | null) {
  const content = node?.closest('ion-content');
  if (!content || !('getScrollElement' in content)) return;
  void (content as { getScrollElement: () => Promise<HTMLElement> }).getScrollElement().then((scroller) => {
    scroller.scrollTop = 0;
  });
}

function privacyHref() {
  const origin = String(import.meta.env.VITE_API_ORIGIN ?? '').trim().replace(/\/$/, '');
  const href = origin ? `${origin}/privacy` : '';
  return href.startsWith('https://') && isSafeExternalUrl(href) ? href : '';
}

function DeleteAccountSection() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const privacy = privacyHref();
  const { t } = useI18n();
  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await adminFetch('/api/account/delete', { method: 'POST', body: { confirm: true } });
      logout();
      navigate('/activation', { replace: true });
    } catch (failure: unknown) {
      setBusy(false);
      setError(failure instanceof AdminApiError && failure.code === 'forbidden'
        ? t('settings.deleteOwner')
        : t('settings.deleteFailed'));
    }
  };
  return (
    <section className="settings-block">
      <h2>{t('settings.account')}</h2>
      <article className="setting-card column">
        <strong>{t('settings.deleteCard')}</strong>
        <p>{t('settings.deleteBody')}</p>
        {privacy ? <a href={privacy} target="_blank" rel="noreferrer">{t('settings.privacyPolicy')}</a> : null}
        <button type="button" className="storage-clear" onClick={() => { setError(''); setOpen(true); }}>{t('settings.deleteMine')}</button>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </article>
      {open && createPortal(
        <div className="wa-scrim center" onClick={() => { if (!busy) setOpen(false); }}>
          <div className="account-dialog" role="alertdialog" aria-labelledby="delete-account-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="delete-account-title">{t('settings.deleteAsk')}</h2>
            <p className="account-warn">{t('settings.deleteWarn')}</p>
            <div className="account-actions">
              <button type="button" disabled={busy} onClick={() => setOpen(false)}>{t('settings.cancel')}</button>
              <button type="button" className="danger" disabled={busy} onClick={() => void remove()}>{busy ? t('settings.deleting') : t('settings.delete')}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}

const colorFields: Array<{ key: 'accent' | 'link' | 'bg' | 'frame'; label: MessageKey; aria: MessageKey }> = [
  { key: 'accent', label: 'settings.accent', aria: 'settings.accentLabel' },
  { key: 'link', label: 'settings.link', aria: 'settings.linkLabel' },
  { key: 'bg', label: 'settings.bg', aria: 'settings.bgLabel' },
  { key: 'frame', label: 'settings.frame', aria: 'settings.frameLabel' },
];

function AppearanceSettings() {
  const appearance = useSettingsStore((state) => state.appearance);
  const setAppearance = useSettingsStore((state) => state.setAppearance);
  const resetAppearance = useSettingsStore((state) => state.resetAppearance);
  const logoRef = useRef<HTMLInputElement>(null);
  const wallpaperRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState('');
  const [wallpaperError, setWallpaperError] = useState('');
  const opacity = Math.round(appearance.wallpaperOpacity * 100);
  const title = appearance.name.trim() || 'ChatX';
  const { t } = useI18n();
  const presetLabel: Record<string, MessageKey> = {
    night: 'preset.night',
    sand: 'preset.sand',
    plum: 'preset.plum',
    'vx-ember': 'preset.vxEmber',
    'vx-glacier': 'preset.vxGlacier',
    'vx-forest': 'preset.vxForest',
    'vx-sunset': 'preset.vxSunset',
    'vx-lilac': 'preset.vxLilac',
    'vx-carbon': 'preset.vxCarbon',
    'vx-gold': 'preset.vxGold',
    'vx-rosewood': 'preset.vxRosewood',
  };

  return (
    <section className="settings-block settings-appearance">
      <h2>{t('settings.lookTitle')}</h2>
      <p className="settings-lead">{t('settings.lookLead')}</p>
      <div className="appearance-stack">
        <div className="appearance-preview" aria-label={t('settings.preview')}>
          <div
            className="appearance-preview-wall"
            style={appearance.wallpaper ? { backgroundImage: `url(${appearance.wallpaper})`, opacity: appearance.wallpaperOpacity } : undefined}
          />
          <div className="appearance-preview-bar" style={{ background: appearance.bg, borderColor: appearance.frame }}>
            <img src={appearance.logo || DEFAULT_LOGO} alt="" width="40" height="40" decoding="async" />
            <span className="appearance-preview-title" dir="auto">{title}</span>
            <span className="appearance-preview-accent" style={{ background: appearance.accent }} aria-hidden="true" />
          </div>
        </div>

        <section className="profile-editor-section">
          <h3>{t('settings.identity')}</h3>
          <p className="profile-style-hint">{t('settings.identityHint')}</p>
          <label className="group-name">
            <span>{t('settings.appName')}</span>
            <input
              className="look-name"
              dir="auto"
              maxLength={24}
              value={appearance.name}
              aria-label={t('settings.appName')}
              placeholder="ChatX"
              onChange={(event) => setAppearance({ name: event.target.value })}
            />
          </label>
          <div className="appearance-logo-row">
            <img src={appearance.logo || DEFAULT_LOGO} alt="" width="56" height="56" decoding="async" />
            <div className="profile-media-actions appearance-logo-actions">
              <button type="button" className="profile-photo-action" onClick={() => logoRef.current?.click()}>{t('settings.changeLogo')}</button>
              {appearance.logo ? (
                <button type="button" className="profile-photo-action" onClick={() => { setLogoError(''); setAppearance({ logo: '' }); }}>{t('settings.remove')}</button>
              ) : null}
            </div>
            <input
              ref={logoRef}
              type="file"
              accept="image/*"
              hidden
              aria-label={t('settings.pickLogo')}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                void logoFromFile(file).then(
                  (logo) => {
                    setLogoError('');
                    setAppearance({ logo });
                  },
                  () => setLogoError(t('settings.logoError')),
                );
              }}
            />
          </div>
          {logoError ? <p className="form-error">{logoError}</p> : null}
        </section>

        <section className="profile-editor-section">
          <h3>{t('settings.wallpaperTitle')}</h3>
          <p className="profile-style-hint">{t('settings.wallpaperHint')}</p>
          <div className="appearance-wall-banner">
            {appearance.wallpaper
              ? <img src={appearance.wallpaper} alt="" decoding="async" style={{ opacity: appearance.wallpaperOpacity }} />
              : <span>{t('settings.noWallpaper')}</span>}
          </div>
          <div className="profile-media-actions">
            <button type="button" className="profile-photo-action" onClick={() => wallpaperRef.current?.click()}>
              {appearance.wallpaper ? t('settings.changeWallpaper') : t('settings.pickWallpaper')}
            </button>
            {appearance.wallpaper ? (
              <button type="button" className="profile-photo-action" onClick={() => { setWallpaperError(''); setAppearance({ wallpaper: '' }); }}>{t('settings.remove')}</button>
            ) : null}
          </div>
          <input
            ref={wallpaperRef}
            type="file"
            accept="image/*"
            hidden
              aria-label={t('settings.pickWallpaperLabel')}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              void wallpaperFromFile(file).then(
                (wallpaper) => {
                  setWallpaperError('');
                  setAppearance({ wallpaper });
                },
                () => setWallpaperError(t('settings.wallpaperError')),
              );
            }}
          />
          {appearance.wallpaper ? (
            <label className="look-opacity">
              <span>{t('settings.opacity')} <b dir="ltr">{opacity}%</b></span>
              <input
                type="range"
                min={15}
                max={80}
                step={5}
                value={opacity}
                aria-label={t('settings.opacityLabel')}
                onChange={(event) => setAppearance({ wallpaperOpacity: Number(event.target.value) / 100 })}
              />
            </label>
          ) : null}
          {wallpaperError ? <p className="form-error">{wallpaperError}</p> : null}
        </section>

        <section className="profile-editor-section">
          <h3>{t('settings.colors')}</h3>
          <p className="profile-style-hint">{t('settings.colorsHint')}</p>
          <div className="setting-choices look-presets appearance-presets" role="radiogroup" aria-label={t('settings.presets')}>
            {APPEARANCE_PRESETS.map((preset) => {
              const selected = appearance.accent === preset.look.accent
                && appearance.bg === preset.look.bg
                && appearance.frame === preset.look.frame
                && appearance.link === preset.look.link;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  dir="auto"
                  aria-checked={selected}
                  className={selected ? 'is-on' : ''}
                  onClick={() => setAppearance(preset.look)}
                >
                  <span className="look-swatch" style={{ background: preset.look.bg, borderColor: preset.look.frame }}>
                    <span style={{ background: preset.look.accent }} />
                  </span>
                  {presetLabel[preset.id] ? t(presetLabel[preset.id]) : preset.label}
                </button>
              );
            })}
          </div>
          <div className="profile-style-block">
            <span className="profile-style-title">{t('settings.customColors')}</span>
            <div className="appearance-color-grid">
              {colorFields.map((field) => {
                const value = appearance[field.key];
                return (
                  <label key={field.key} className="look-color">
                    {t(field.label)}
                    <span className="look-chip" style={{ background: value }}>
                      <input
                        type="color"
                        aria-label={t(field.aria)}
                        value={value}
                        onChange={(event) => {
                          const next = event.target.value;
                          if (field.key === 'bg') setAppearance({ bg: next, surface: next });
                          else if (field.key === 'accent') setAppearance({ accent: next });
                          else if (field.key === 'link') setAppearance({ link: next });
                          else setAppearance({ frame: next });
                        }}
                      />
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <button type="button" className="storage-clear appearance-reset" onClick={() => { setLogoError(''); setWallpaperError(''); resetAppearance(); }}>
            {t('settings.reset')}
          </button>
        </section>
      </div>
    </section>
  );
}

export default function SettingsPage({ embedded = false }: SettingsPageProps) {
  const dataSaver = useSettingsStore((state) => state.dataSaver);
  const autoImages = useSettingsStore((state) => state.autoDownloadImages);
  const autoVideos = useSettingsStore((state) => state.autoDownloadVideos);
  const imageQuality = useSettingsStore((state) => state.imageQuality);
  const videoQuality = useSettingsStore((state) => state.videoQuality);
  const cachedMessages = useChatStore((state) => state.messages);
  const usage = cachedMessages.reduce((total, message) => {
    if (message.media?.localPreviewUrl && message.media.state === 'cached') {
      const kind = message.type === 'image' ? 'images' : message.type === 'video' ? 'videos' : 'other';
      total[kind] += message.media.fileSize;
    }
    return total;
  }, { images: 0, videos: 0, other: 0 });
  const setDataSaver = useSettingsStore((state) => state.setDataSaver);
  const setAutoImages = useSettingsStore((state) => state.setAutoDownloadImages);
  const setAutoVideos = useSettingsStore((state) => state.setAutoDownloadVideos);
  const setImageQuality = useSettingsStore((state) => state.setImageQuality);
  const setVideoQuality = useSettingsStore((state) => state.setVideoQuality);
  const notifyTypes = useSettingsStore((state) => state.notifyTypes);
  const setNotifyType = useSettingsStore((state) => state.setNotifyType);
  const clearCache = useSettingsStore((state) => state.clearCache);
  const resetMediaCache = useChatStore((state) => state.resetMediaCache);
  const total = usage.images + usage.videos + usage.other;
  const imageHint = imageChoices.find((choice) => choice.value === imageQuality)?.hint;
  const videoHint = videoChoices.find((choice) => choice.value === videoQuality)?.hint;

  const showTyping = useSettingsStore((state) => state.showTyping);
  const setShowTyping = useSettingsStore((state) => state.setShowTyping);
  const shellRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<SettingsSection>('look');
  const { t } = useI18n();

  const openSection = (next: SettingsSection, tab: HTMLButtonElement) => {
    if (next === section) return;
    setSection(next);
    tab.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    scrollSettings(shellRef.current);
  };

  const body = (
    <div ref={shellRef} className="settings-shell profile-frame">
        <LanguagePicker />
        <div className="group-tabs is-scroll settings-tabs" role="tablist" aria-label={t('settings.sections')}>
          {settingsSections.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`settings-tab-${item.id}`}
              aria-selected={section === item.id}
              aria-controls={`settings-panel-${item.id}`}
              className={section === item.id ? 'is-on' : undefined}
              onClick={(event) => openSection(item.id, event.currentTarget)}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
        <div className="settings-panel" role="tabpanel" id={`settings-panel-${section}`} aria-labelledby={`settings-tab-${section}`}>
        {section === 'look' && <AppearanceSettings />}
        {section === 'privacy' && <section className="settings-block">
          <h2>{t('settings.privacyTitle')}</h2>
          <article className="setting-card">
            <div>
              <strong>{t('settings.typing')}</strong>
              <p>{t('settings.typingHint')}</p>
            </div>
            <IonToggle
              checked={showTyping}
              aria-label={t('settings.typingLabel')}
              onIonChange={(event) => setShowTyping(event.detail.checked)}
            />
          </article>
        </section>}
        {section === 'alerts' && <section className="settings-block">
          <h2>{t('settings.alertsTitle')}</h2>
          <p className="settings-lead">{t('settings.alertsLead')}</p>
          <NotificationPermissionCard />
          <PushConnectionCard />
          <div className="notify-types" role="group" aria-label={t('settings.notifyTypes')}>
            {(Object.keys(notifyTypes) as InboxKind[]).map((kind) => {
              const look = notificationPresentation(kind);
              return (
                <article key={kind} className="setting-card">
                  <div>
                    <strong dir={look.ltr ? 'ltr' : undefined}>{look.label}</strong>
                    <p>{!notifyTypes[kind] ? t('settings.mutedHint') : kind === 'message' ? t('settings.messageHint') : kind === 'reaction' || kind === 'signal' ? t('settings.quietHint') : t('settings.alertHint')}</p>
                  </div>
                  <IonToggle
                    checked={notifyTypes[kind]}
                    aria-label={look.label}
                    onIonChange={(event) => setNotifyType(kind, event.detail.checked)}
                  />
                </article>
              );
            })}
          </div>
        </section>}
        {section === 'receive' && <section className="settings-block">
          <h2>{t('settings.receiveTitle')}</h2>
          <p className="settings-lead">{t('settings.receiveLead')}</p>
          <article className="setting-card">
            <div>
              <strong>{t('settings.dataSaver')}</strong>
              <p>{dataSaver ? t('settings.dataSaverOn') : t('settings.dataSaverOff')}</p>
            </div>
            <IonToggle checked={dataSaver} aria-label={t('settings.dataSaver')} onIonChange={(event) => setDataSaver(event.detail.checked)} />
          </article>
          <article className={dataSaver ? 'setting-card is-paused' : 'setting-card'}>
            <div>
              <strong>{t('settings.autoImages')}</strong>
              <p>{dataSaver ? t('settings.paused') : t('settings.autoImagesOn')}</p>
            </div>
            <IonToggle
              checked={!dataSaver && autoImages}
              disabled={dataSaver}
              aria-label={t('settings.autoImages')}
              onIonChange={(event) => setAutoImages(event.detail.checked)}
            />
          </article>
          <article className={dataSaver ? 'setting-card is-paused' : 'setting-card'}>
            <div>
              <strong>{t('settings.autoVideos')}</strong>
              <p>{dataSaver ? t('settings.paused') : t('settings.autoVideosOn')}</p>
            </div>
            <IonToggle
              checked={!dataSaver && autoVideos}
              disabled={dataSaver}
              aria-label={t('settings.autoVideos')}
              onIonChange={(event) => setAutoVideos(event.detail.checked)}
            />
          </article>
        </section>}

        {section === 'send' && <section className="settings-block">
          <h2>{t('settings.sendTitle')}</h2>
          <p className="settings-lead">{t('settings.sendLead')}</p>
          <article className="setting-card column">
            <strong>{t('settings.imageQuality')}</strong>
            <div className="setting-choices" role="radiogroup" aria-label={t('settings.imageQuality')}>
              {imageChoices.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={imageQuality === choice.value}
                  className={imageQuality === choice.value ? 'is-on' : ''}
                  onClick={() => setImageQuality(choice.value)}
                >
                  {t(choice.label)}
                </button>
              ))}
            </div>
            <p>{imageHint ? t(imageHint) : ''}</p>
          </article>
          <article className="setting-card column">
            <strong>{t('settings.videoQuality')}</strong>
            <div className="setting-choices" role="radiogroup" aria-label={t('settings.videoQuality')}>
              {videoChoices.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={videoQuality === choice.value}
                  className={videoQuality === choice.value ? 'is-on' : ''}
                  onClick={() => setVideoQuality(choice.value)}
                >
                  {choice.value === 'original' ? t('quality.original') : choice.label}
                </button>
              ))}
            </div>
            <p>{videoHint ? t(videoHint) : ''}</p>
          </article>
        </section>}

        {section === 'storage' && <section className="settings-block">
          <h2>{t('settings.storageTitle')}</h2>
          <p className="settings-lead">{t('settings.storageLead')}</p>
          <article className="setting-card column">
            <div className="storage-head">
              <strong>{total > 0 ? formatBytes(total) : t('settings.empty')}</strong>
              <span>{t('settings.temp')}</span>
            </div>
            {total > 0 && (
              <div className="storage-bar" aria-hidden="true">
                <span className="images" style={{ flex: usage.images }} />
                <span className="videos" style={{ flex: usage.videos }} />
                <span className="other" style={{ flex: usage.other }} />
              </div>
            )}
            <ul className="storage-list">
              <li><i className="images" /> {t('settings.images')} <b>{formatBytes(usage.images)}</b></li>
              <li><i className="videos" /> {t('settings.videos')} <b>{formatBytes(usage.videos)}</b></li>
              <li><i className="other" /> {t('settings.other')} <b>{formatBytes(usage.other)}</b></li>
            </ul>
            <button
              type="button"
              className="storage-clear"
              disabled={total === 0}
              onClick={() => {
                clearCache();
                resetMediaCache();
              }}
            >
              {t('settings.clear')}
            </button>
          </article>
        </section>}
        {section === 'account' && <DeleteAccountSection />}
        </div>
    </div>
  );

  if (embedded) return body;

  return (
    <IonPage>
      <IonHeader>
        <NetworkStatusBanner />
        <PageNav title={t('account.settings')} fallback="/account" />
      </IonHeader>
      <IonContent className="settings-page">{body}</IonContent>
    </IonPage>
  );
}
