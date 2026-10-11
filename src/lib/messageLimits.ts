import { FILE_BYTES_MAX, VIDEO_BYTES_MAX } from './chatFile';
import { formatBytes } from './media';
import type { Message } from '../types/message';
import { AdminApiError } from './adminApi';

export const MESSAGE_TEXT_MAX = 4000;
/** Avant compression côté appareil (sélection galerie). */
export const PICKER_IMAGE_BYTES_MAX = 20 * 1024 * 1024;

export function textTooLongMessage(length?: number) {
  const detail = typeof length === 'number' && length > MESSAGE_TEXT_MAX
    ? ` (${length.toLocaleString('ar-EG')} حرفًا)`
    : '';
  return `الرسالة أطول من الحد المسموح (${MESSAGE_TEXT_MAX.toLocaleString('ar-EG')} حرفًا)${detail}. قصّر النص ثم أعد الإرسال.`;
}

export function fileTooLargeMessage(size?: number) {
  const picked = typeof size === 'number' && size > 0 ? ` الملف المختار: ${formatBytes(size)}.` : '';
  return `الملف كبير جدًا. الحد الأقصى ${formatBytes(FILE_BYTES_MAX)}.${picked}`;
}

export function videoTooLargeMessage(size?: number) {
  const picked = typeof size === 'number' && size > 0 ? ` الفيديو المختار: ${formatBytes(size)}.` : '';
  return `الفيديو كبير جدًا. الحد الأقصى ${formatBytes(VIDEO_BYTES_MAX)}.${picked}`;
}

export function imageTooLargeMessage() {
  return 'الصورة كبيرة جدًا بعد الضغط. جرّب جودة «توفير البيانات» أو اختر صورة أصغر.';
}

export function pickerImageTooLargeMessage(size?: number) {
  const picked = typeof size === 'number' && size > 0 ? ` (${formatBytes(size)})` : '';
  return `الصورة كبيرة جدًا${picked}. الحد قبل الضغط: ${formatBytes(PICKER_IMAGE_BYTES_MAX)}.`;
}

export function attachmentLimitSummaryMessage() {
  return `يمكن إرفاق 10 عناصر كحد أقصى، وفيديو واحد. الصور حتى ${formatBytes(PICKER_IMAGE_BYTES_MAX)}، الملفات حتى ${formatBytes(FILE_BYTES_MAX)}، والفيديو حتى ${formatBytes(VIDEO_BYTES_MAX)}.`;
}

export function outgoingFailureMessage(error: unknown, message: Message) {
  const size = message.media?.fileSize;
  if (error instanceof Error) {
    if (error.message === 'file_too_large') {
      return message.type === 'video' ? videoTooLargeMessage(size) : fileTooLargeMessage(size);
    }
    if (error.message === 'invalid_image') return imageTooLargeMessage();
  }
  if (error instanceof AdminApiError && error.code === 'invalid_upload') {
    if (message.type === 'video') return videoTooLargeMessage(size);
    if (message.type === 'file') return fileTooLargeMessage(size);
    if (message.type === 'image') return imageTooLargeMessage();
    return 'تعذر رفع المرفق. تحقق من الحجم والصيغة ثم أعد المحاولة.';
  }
  return 'تعذر تجهيز أو إرسال الرسالة. تحقق من الملف أو الاتصال ثم أعد المحاولة.';
}
