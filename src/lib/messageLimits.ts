import { FILE_BYTES_MAX, VIDEO_BYTES_MAX } from './chatFile';
import { formatBytes } from './media';
import type { Message } from '../types/message';
import { AdminApiError } from './adminApi';
import { retryableStatus } from './retry';
import { currentLocale, dateLocale, translate, type Locale } from './i18n';

export function sendConnectionMessage(locale: Locale = currentLocale()) {
  return translate(locale, 'messageLimit.sendConnection');
}

const PERMANENT_SEND = new Set(['file_too_large', 'invalid_image', 'unsupported_media', 'size']);

/** A dropped session or network should wait and retry, without a red banner. */
export function quietOutgoingError(error: unknown) {
  if (error instanceof AdminApiError) {
    if (error.code === 'invalid_upload') return false;
    return error.code === 'offline'
      || error.code === 'account_changed'
      || error.code === 'no_identity'
      || error.code === 'invalid_credentials'
      || error.status === 0
      || retryableStatus(error.status);
  }
  if (error instanceof Error) return !PERMANENT_SEND.has(error.message);
  return true;
}

export const MESSAGE_TEXT_MAX = 4000;
/** Avant compression côté appareil (sélection galerie). */
export const PICKER_IMAGE_BYTES_MAX = 20 * 1024 * 1024;

function numLocale(n: number, locale: Locale) {
  return n.toLocaleString(dateLocale(locale));
}

export function textTooLongMessage(length?: number, locale: Locale = currentLocale()) {
  const detail = typeof length === 'number' && length > MESSAGE_TEXT_MAX
    ? translate(locale, 'messageLimit.textTooLongDetail', { length: numLocale(length, locale) })
    : '';
  return translate(locale, 'messageLimit.textTooLong', {
    max: numLocale(MESSAGE_TEXT_MAX, locale),
    detail,
  });
}

export function fileTooLargeMessage(size?: number, locale: Locale = currentLocale()) {
  const picked = typeof size === 'number' && size > 0
    ? translate(locale, 'messageLimit.filePicked', { size: formatBytes(size) })
    : '';
  return translate(locale, 'messageLimit.fileTooLarge', { max: formatBytes(FILE_BYTES_MAX), picked });
}

export function videoTooLargeMessage(size?: number, locale: Locale = currentLocale()) {
  const picked = typeof size === 'number' && size > 0
    ? translate(locale, 'messageLimit.videoPicked', { size: formatBytes(size) })
    : '';
  return translate(locale, 'messageLimit.videoTooLarge', { max: formatBytes(VIDEO_BYTES_MAX), picked });
}

export function imageTooLargeMessage(locale: Locale = currentLocale()) {
  return translate(locale, 'messageLimit.imageTooLargeAfterFit');
}

export function pickerImageTooLargeMessage(size?: number, locale: Locale = currentLocale()) {
  const picked = typeof size === 'number' && size > 0
    ? translate(locale, 'messageLimit.pickerImagePicked', { size: formatBytes(size) })
    : '';
  return translate(locale, 'messageLimit.pickerImageTooLarge', { max: formatBytes(PICKER_IMAGE_BYTES_MAX), picked });
}

export function attachmentLimitSummaryMessage(locale: Locale = currentLocale()) {
  return translate(locale, 'messageLimit.attachmentSummary', {
    imgMax: formatBytes(PICKER_IMAGE_BYTES_MAX),
    fileMax: formatBytes(FILE_BYTES_MAX),
    vidMax: formatBytes(VIDEO_BYTES_MAX),
  });
}

export function outgoingFailureMessage(error: unknown, message: Message, locale: Locale = currentLocale()) {
  const size = message.media?.fileSize;
  if (error instanceof Error) {
    if (error.message === 'file_too_large') {
      return message.type === 'video' ? videoTooLargeMessage(size, locale) : fileTooLargeMessage(size, locale);
    }
    if (error.message === 'invalid_image') return imageTooLargeMessage(locale);
  }
  if (error instanceof AdminApiError && error.code === 'invalid_upload') {
    if (message.type === 'video') return videoTooLargeMessage(size, locale);
    if (message.type === 'file') return fileTooLargeMessage(size, locale);
    if (message.type === 'image') return imageTooLargeMessage(locale);
    return translate(locale, 'messageLimit.uploadFailed');
  }
  return sendConnectionMessage(locale);
}
