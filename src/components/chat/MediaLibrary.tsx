import { useMemo, useState, type ReactNode } from 'react';
import { IonIcon } from '@ionic/react';
import { imageOutline, linkOutline, play, videocamOutline } from 'ionicons/icons';
import { firstUrl, siteHost } from '../../lib/link';
import { formatDuration } from '../../lib/media';
import { isSafeExternalUrl } from '../../lib/url';
import { useChatStore } from '../../stores/chatStore';
import type { Message } from '../../types/message';

export type MediaKind = 'photos' | 'videos' | 'links';

export function collectMedia(messages: Message[], conversationId: string) {
  const visible = messages.filter((message) => message.conversationId === conversationId && !message.deletedForEveryone);
  const photos = visible.filter((message) => message.type === 'image');
  const videos = visible.filter((message) => message.type === 'video');
  const links = visible.flatMap((message) => {
    const fromCard = message.link?.url && isSafeExternalUrl(message.link.url) ? message.link.url : '';
    const url = fromCard || firstUrl(message.text ?? '');
    if (!url) return [];
    return [{ id: message.id, url, title: message.link?.title || siteHost(url), host: siteHost(url) }];
  });
  return { photos, videos, links };
}

type MediaPanelProps = {
  conversationId: string;
  kind: MediaKind;
  scope: string;
};

export function MediaPanel({ conversationId, kind, scope }: MediaPanelProps) {
  const messages = useChatStore((state) => state.messages);
  const media = useMemo(() => collectMedia(messages, conversationId), [conversationId, messages]);

  if (kind === 'photos') {
    if (media.photos.length === 0) return <p className="group-empty">لا توجد صور في هذه {scope}.</p>;
    return (
      <div className="group-photo-grid">
        {media.photos.map((message) => (
          <div key={message.id} className="group-tile">
            {message.media?.localPreviewUrl ? <img src={message.media.localPreviewUrl} alt="" /> : <IonIcon icon={imageOutline} />}
          </div>
        ))}
      </div>
    );
  }

  if (kind === 'videos') {
    if (media.videos.length === 0) return <p className="group-empty">لا توجد فيديوهات في هذه {scope}.</p>;
    return (
      <div className="group-photo-grid">
        {media.videos.map((message) => (
          <div key={message.id} className="group-tile">
            {message.media?.localPreviewUrl ? <img src={message.media.localPreviewUrl} alt="" /> : <IonIcon icon={videocamOutline} />}
            <span className="group-tile-play">
              <IonIcon icon={play} />
            </span>
            {typeof message.media?.duration === 'number' && <time>{formatDuration(message.media.duration)}</time>}
          </div>
        ))}
      </div>
    );
  }

  if (media.links.length === 0) return <p className="group-empty">لا توجد روابط في هذه {scope}.</p>;
  return (
    <div className="group-links">
      {media.links.map((item) => (
        <a key={item.id} className="group-link" href={item.url} target="_blank" rel="noreferrer">
          <IonIcon icon={linkOutline} />
          <span>
            <strong>{item.title}</strong>
            <small dir="ltr">{item.host}</small>
          </span>
        </a>
      ))}
    </div>
  );
}

type DirectTab = 'notify' | MediaKind;

type MediaTabsProps = {
  conversationId: string;
  scope: string;
  label: string;
  notify?: ReactNode;
};

export default function MediaTabs({ conversationId, scope, label, notify }: MediaTabsProps) {
  const messages = useChatStore((state) => state.messages);
  const media = useMemo(() => collectMedia(messages, conversationId), [conversationId, messages]);
  const [kind, setKind] = useState<DirectTab>(notify ? 'notify' : 'photos');
  const tabs: Array<{ id: DirectTab; label: string; count: number }> = [
    ...(notify ? [{ id: 'notify' as const, label: 'الإشعارات', count: 0 }] : []),
    { id: 'photos', label: 'الصور', count: media.photos.length },
    { id: 'videos', label: 'الفيديو', count: media.videos.length },
    { id: 'links', label: 'الروابط', count: media.links.length },
  ];

  return (
    <>
      <div className={tabs.length === 4 ? 'group-tabs is-four' : 'group-tabs is-three'} role="tablist" aria-label={label}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={kind === item.id}
            className={kind === item.id ? 'is-on' : undefined}
            onClick={() => setKind(item.id)}
          >
            <span>{item.label}</span>
            {item.count > 0 && <em>{item.count}</em>}
          </button>
        ))}
      </div>
      <section className="group-block" role="tabpanel">
        {kind === 'notify' ? notify : <MediaPanel conversationId={conversationId} kind={kind} scope={scope} />}
      </section>
    </>
  );
}
