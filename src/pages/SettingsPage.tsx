import { useRef, useState } from 'react';
import { IonContent, IonHeader, IonPage, IonToggle } from '@ionic/react';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import NotificationPermissionCard from '../components/common/NotificationPermission';
import PageNav from '../components/common/PageNav';
import { APPEARANCE_PRESETS, DEFAULT_LOGO, logoFromFile, wallpaperFromFile } from '../lib/appearance';
import { notificationPresentation, type InboxKind } from '../lib/inbox';
import { formatBytes } from '../lib/media';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { ImageQuality, VideoQuality } from '../types/settings';

const imageChoices: Array<{ value: ImageQuality; label: string; hint: string }> = [
  { value: 'saver', label: 'صغيرة', hint: 'حتى 20 KB للصورة، مناسب لباقات الإنترنت الصغيرة.' },
  { value: 'medium', label: 'متوسطة', hint: 'توازن بين الوضوح والحجم، حتى 40 KB للصورة.' },
  { value: 'original', label: 'عالية', hint: 'وضوح أعلى، مع ضغط الصورة إلى 60 KB كحد أقصى.' },
];

const videoChoices: Array<{ value: VideoQuality; label: string; hint: string }> = [
  { value: '480', label: '480p', hint: 'يُرسل الملف كما هو، حتى 8 MB.' },
  { value: '720', label: '720p', hint: 'يُرسل الملف كما هو، حتى 8 MB.' },
  { value: 'original', label: 'أصلي', hint: 'يُرسل الملف كما هو، حتى 8 MB.' },
];

type SettingsPageProps = { embedded?: boolean };

const colorFields: Array<{ key: 'accent' | 'link' | 'bg' | 'frame'; label: string; aria: string }> = [
  { key: 'accent', label: 'التمييز', aria: 'لون التمييز' },
  { key: 'link', label: 'الروابط', aria: 'لون الروابط' },
  { key: 'bg', label: 'الخلفية', aria: 'لون الخلفية' },
  { key: 'frame', label: 'الإطار', aria: 'لون الإطار' },
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

  return (
    <section className="settings-block settings-appearance">
      <h2>المظهر</h2>
      <p className="settings-lead">يُحفظ على هذا الجهاز فقط. لون الكتابة يتبع إضاءة الخلفية تلقائيًا.</p>
      <div className="appearance-stack">
        <div className="appearance-preview" aria-label="معاينة مظهر التطبيق">
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
          <h3>هوية التطبيق</h3>
          <p className="profile-style-hint">الاسم والشعار يظهران في الصفحة الرئيسية وشاشة البدء.</p>
          <label className="group-name">
            <span>اسم التطبيق</span>
            <input
              className="look-name"
              dir="auto"
              maxLength={24}
              value={appearance.name}
              aria-label="اسم التطبيق"
              placeholder="ChatX"
              onChange={(event) => setAppearance({ name: event.target.value })}
            />
          </label>
          <div className="appearance-logo-row">
            <img src={appearance.logo || DEFAULT_LOGO} alt="" width="56" height="56" decoding="async" />
            <div className="profile-media-actions appearance-logo-actions">
              <button type="button" className="profile-photo-action" onClick={() => logoRef.current?.click()}>تغيير الشعار</button>
              {appearance.logo ? (
                <button type="button" className="profile-photo-action" onClick={() => { setLogoError(''); setAppearance({ logo: '' }); }}>إزالة</button>
              ) : null}
            </div>
            <input
              ref={logoRef}
              type="file"
              accept="image/*"
              hidden
              aria-label="اختيار الشعار"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                void logoFromFile(file).then(
                  (logo) => {
                    setLogoError('');
                    setAppearance({ logo });
                  },
                  () => setLogoError('تعذر استخدام هذه الصورة. اختر صورة أصغر.'),
                );
              }}
            />
          </div>
          {logoError ? <p className="form-error">{logoError}</p> : null}
        </section>

        <section className="profile-editor-section">
          <h3>خلفية المحادثات</h3>
          <p className="profile-style-hint">صورة خفيفة خلف فقاعات الرسائل. اتركها فارغة لاستخدام اللون فقط.</p>
          <div className="appearance-wall-banner">
            {appearance.wallpaper
              ? <img src={appearance.wallpaper} alt="" decoding="async" style={{ opacity: appearance.wallpaperOpacity }} />
              : <span>بدون صورة</span>}
          </div>
          <div className="profile-media-actions">
            <button type="button" className="profile-photo-action" onClick={() => wallpaperRef.current?.click()}>
              {appearance.wallpaper ? 'تغيير الصورة' : 'اختيار صورة'}
            </button>
            {appearance.wallpaper ? (
              <button type="button" className="profile-photo-action" onClick={() => { setWallpaperError(''); setAppearance({ wallpaper: '' }); }}>إزالة</button>
            ) : null}
          </div>
          <input
            ref={wallpaperRef}
            type="file"
            accept="image/*"
            hidden
            aria-label="اختيار صورة الخلفية"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              void wallpaperFromFile(file).then(
                (wallpaper) => {
                  setWallpaperError('');
                  setAppearance({ wallpaper });
                },
                () => setWallpaperError('تعذر استخدام هذه الصورة. اختر صورة أصغر.'),
              );
            }}
          />
          {appearance.wallpaper ? (
            <label className="look-opacity">
              <span>الشفافية <b dir="ltr">{opacity}%</b></span>
              <input
                type="range"
                min={15}
                max={80}
                step={5}
                value={opacity}
                aria-label="شفافية الخلفية"
                onChange={(event) => setAppearance({ wallpaperOpacity: Number(event.target.value) / 100 })}
              />
            </label>
          ) : null}
          {wallpaperError ? <p className="form-error">{wallpaperError}</p> : null}
        </section>

        <section className="profile-editor-section">
          <h3>الألوان</h3>
          <p className="profile-style-hint">اختر نمطًا جاهزًا أو عدّل الألوان يدويًا.</p>
          <div className="setting-choices look-presets appearance-presets" role="radiogroup" aria-label="أنماط جاهزة">
            {APPEARANCE_PRESETS.map((preset) => {
              const selected = appearance.accent === preset.look.accent && appearance.bg === preset.look.bg && appearance.frame === preset.look.frame;
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
                  {preset.label}
                </button>
              );
            })}
          </div>
          <div className="profile-style-block">
            <span className="profile-style-title">تخصيص الألوان</span>
            <div className="appearance-color-grid">
              {colorFields.map((field) => {
                const value = appearance[field.key];
                return (
                  <label key={field.key} className="look-color">
                    {field.label}
                    <span className="look-chip" style={{ background: value }}>
                      <input
                        type="color"
                        aria-label={field.aria}
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
            استعادة المظهر الافتراضي
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

  const body = (
    <div className="settings-shell profile-frame">
        <AppearanceSettings />
        <section className="settings-block">
          <h2>الخصوصية</h2>
          <article className="setting-card">
            <div>
              <strong>أظهر عندما أكتب</strong>
              <p>يرى أعضاء المحادثة أنك تكتب. أوقفه ليبقى ذلك مخفيًا.</p>
            </div>
            <IonToggle
              checked={showTyping}
              aria-label="العرض أثناء الكتابة"
              onIonChange={(event) => setShowTyping(event.detail.checked)}
            />
          </article>
        </section>
        <section className="settings-block">
          <h2>الإشعارات</h2>
          <p className="settings-lead">تظهر اللافتات وإشعارات الهاتف للإشارات والردود والرسائل الخاصة فقط. رسائل المجموعات العادية والتفاعلات والأحداث تبقى في صفحة الإشعارات. عند قراءة الرسالة يزول التنبيه.</p>
          <NotificationPermissionCard />
          <div className="notify-types" role="group" aria-label="أنواع الإشعارات">
            {(Object.keys(notifyTypes) as InboxKind[]).map((kind) => {
              const look = notificationPresentation(kind);
              return (
                <article key={kind} className="setting-card">
                  <div>
                    <strong dir={look.ltr ? 'ltr' : undefined}>{look.label}</strong>
                    <p>{!notifyTypes[kind] ? 'التنبيه مكتوم، وتبقى الرسالة في الإشعارات' : kind === 'message' ? 'لافتات للرسائل الخاصة؛ رسائل المجموعات داخل التطبيق فقط' : kind === 'reaction' || kind === 'signal' ? 'داخل صفحة الإشعارات فقط، بدون لافتة أو تنبيه للهاتف' : 'لافتة داخل التطبيق وإشعار للهاتف في الخلفية'}</p>
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
        </section>
        <section className="settings-block">
          <h2>الاستقبال</h2>
          <p className="settings-lead">ما يحدث للصور والفيديو التي يصلك.</p>
          <article className="setting-card">
            <div>
              <strong>توفير البيانات</strong>
              <p>{dataSaver ? 'الوضع الموفّر مفعّل، وهو الاختيار الأول. تتوقف حركة زينة الملف وتنزيل الوسائط. تتباعد تحديثات القائمة والتنبيهات إلى 40 ثانية، وتبقى المحادثة المفتوحة كل 20 ثانية.' : 'الوضع العادي. تعود حركة زينة الملف. الصور والفيديو تتبعان الإعدادين أسفل.'}</p>
            </div>
            <IonToggle checked={dataSaver} aria-label="توفير البيانات" onIonChange={(event) => setDataSaver(event.detail.checked)} />
          </article>
          <article className={dataSaver ? 'setting-card is-paused' : 'setting-card'}>
            <div>
              <strong>تنزيل الصور تلقائيًا</strong>
              <p>{dataSaver ? 'متوقف لأن توفير البيانات مفعّل.' : 'تُفتح الصور وحدها عند عرض الرسالة.'}</p>
            </div>
            <IonToggle
              checked={!dataSaver && autoImages}
              disabled={dataSaver}
              aria-label="تنزيل الصور تلقائيًا"
              onIonChange={(event) => setAutoImages(event.detail.checked)}
            />
          </article>
          <article className={dataSaver ? 'setting-card is-paused' : 'setting-card'}>
            <div>
              <strong>تنزيل الفيديو تلقائيًا</strong>
              <p>{dataSaver ? 'متوقف لأن توفير البيانات مفعّل.' : 'يبدأ الفيديو بالتحميل عند عرض الرسالة.'}</p>
            </div>
            <IonToggle
              checked={!dataSaver && autoVideos}
              disabled={dataSaver}
              aria-label="تنزيل الفيديو تلقائيًا"
              onIonChange={(event) => setAutoVideos(event.detail.checked)}
            />
          </article>
        </section>

        <section className="settings-block">
          <h2>الإرسال</h2>
          <p className="settings-lead">حجم الصور والفيديو التي ترسلها. هذا مستقل عن توفير البيانات.</p>
          <article className="setting-card column">
            <strong>جودة الصور</strong>
            <div className="setting-choices" role="radiogroup" aria-label="جودة الصور">
              {imageChoices.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={imageQuality === choice.value}
                  className={imageQuality === choice.value ? 'is-on' : ''}
                  onClick={() => setImageQuality(choice.value)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <p>{imageHint}</p>
          </article>
          <article className="setting-card column">
            <strong>جودة الفيديو</strong>
            <div className="setting-choices" role="radiogroup" aria-label="جودة الفيديو">
              {videoChoices.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={videoQuality === choice.value}
                  className={videoQuality === choice.value ? 'is-on' : ''}
                  onClick={() => setVideoQuality(choice.value)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <p>{videoHint}</p>
          </article>
        </section>

        <section className="settings-block">
          <h2>التخزين</h2>
          <p className="settings-lead">الملفات المحفوظة على هذا الهاتف. مسحها يطلب تنزيلها من جديد.</p>
          <article className="setting-card column">
            <div className="storage-head">
              <strong>{total > 0 ? formatBytes(total) : 'فارغ'}</strong>
              <span>الملفات المؤقتة</span>
            </div>
            {total > 0 && (
              <div className="storage-bar" aria-hidden="true">
                <span className="images" style={{ flex: usage.images }} />
                <span className="videos" style={{ flex: usage.videos }} />
                <span className="other" style={{ flex: usage.other }} />
              </div>
            )}
            <ul className="storage-list">
              <li><i className="images" /> الصور <b>{formatBytes(usage.images)}</b></li>
              <li><i className="videos" /> الفيديو <b>{formatBytes(usage.videos)}</b></li>
              <li><i className="other" /> ملفات أخرى <b>{formatBytes(usage.other)}</b></li>
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
              مسح الملفات المؤقتة
            </button>
          </article>
        </section>
        <section className="settings-block settings-block-tail">
          <h2>حقوق الإيموجي</h2>
          <p className="settings-lead" dir="ltr">Fluent Emoji © Microsoft Corporation · MIT</p>
          <a href="https://github.com/microsoft/fluentui-emoji" target="_blank" rel="noreferrer">مصدر الرسومات وترخيصها</a>
        </section>
    </div>
  );

  if (embedded) return body;

  return (
    <IonPage>
      <IonHeader>
        <NetworkStatusBanner />
        <PageNav title="الإعدادات" fallback="/account" />
      </IonHeader>
      <IonContent className="settings-page">{body}</IonContent>
    </IonPage>
  );
}
