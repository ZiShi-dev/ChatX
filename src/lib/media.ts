import type { Message } from '../types/message';
import type { ImageQuality, VideoQuality } from '../types/settings';

const KB = 1024;
const MB = 1024 * 1024;

export function formatBytes(bytes: number) {
  if (bytes <= 0) return '0 KB';
  if (bytes < MB) return `${Math.max(1, Math.round(bytes / KB))} KB`;
  const value = bytes / MB;
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} MB`;
}

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function messagePreview(message?: Message, mine = false) {
  if (!message) return 'لا توجد رسائل بعد';
  if (message.deletedForEveryone) return mine ? 'لقد حذفت هذه الرسالة' : 'تم حذف هذه الرسالة';
  if (message.type === 'image') return 'صورة';
  if (message.type === 'video') return 'فيديو';
  if (message.type === 'file') return message.media?.fileName || 'ملف';
  if (message.type === 'link') return message.link?.title || message.link?.url || 'رابط';
  return message.text ?? '';
}

export function expectedImageSize(quality: ImageQuality) {
  if (quality === 'saver') return 20_000;
  if (quality === 'medium') return 40_000;
  return 60_000;
}

export function expectedVideoSize(quality: VideoQuality) {
  if (quality === '480') return 12 * MB;
  if (quality === '720') return 28 * MB;
  return 78 * MB;
}

export const ORIGINAL_IMAGE_SIZE = 4.8 * MB;
export const ORIGINAL_VIDEO_SIZE = 78 * MB;

export function shouldAutoDownload(dataSaver: boolean, enabled: boolean) {
  return !dataSaver && enabled;
}

export function nextMediaState(state: 'remote' | 'downloading' | 'cached', progress: number) {
  if (progress >= 100) return 'cached' as const;
  if (state === 'cached') return 'cached' as const;
  return 'downloading' as const;
}
