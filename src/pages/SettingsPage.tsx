import { IonContent, IonHeader, IonPage, IonToggle } from '@ionic/react';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import NotificationPermissionCard from '../components/common/NotificationPermission';
import PageNav from '../components/common/PageNav';
import { notificationPresentation, type InboxKind } from '../lib/inbox';
import { formatBytes } from '../lib/media';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { ImageQuality, VideoQuality } from '../types/settings';

const imageChoices: Array<{ value: ImageQuality; label: string; hint: string }> = [
  { value: 'saver', label: 'صغيرة', hint: 'ملف أخف، مناسب للاتصال الضعيف.' },
  { value: 'medium', label: 'متوسطة', hint: 'توازن بين الوضوح والحجم.' },
  { value: 'original', label: 'عالية', hint: 'وضوح أعلى، مع ضغط الصورة إلى 60 KB كحد أقصى.' },
];

const videoChoices: Array<{ value: VideoQuality; label: string; hint: string }> = [
  { value: '480', label: '480p', hint: 'فيديو خفيف للإرسال.' },
  { value: '720', label: '720p', hint: 'وضوح أعلى وحجم متوسط.' },
  { value: 'original', label: 'أصلي', hint: 'الجودة الكاملة، أبطأ في الإرسال.' },
];

type SettingsPageProps = { embedded?: boolean };

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

  const body = (
    <>
        <section className="settings-block">
          <h2>الإشعارات</h2>
          <p className="settings-lead">نفس الإذن لأندرويد، سواء كانت الرسالة في مجموعة أو في محادثة خاصة.</p>
          <NotificationPermissionCard />
          <div className="notify-types" role="group" aria-label="أنواع الإشعارات">
            {(Object.keys(notifyTypes) as InboxKind[]).map((kind) => {
              const look = notificationPresentation(kind);
              return (
                <article key={kind} className="setting-card">
                  <div>
                    <strong dir={look.ltr ? 'ltr' : undefined}>{look.label}</strong>
                    <p>{notifyTypes[kind] ? 'مفعل' : 'مكتوم'}</p>
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
              <p>لا يُنزَّل شيء تلقائيًا. تضغط على الصورة أو الفيديو عندما تريد.</p>
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
    </>
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
