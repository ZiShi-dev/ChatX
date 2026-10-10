import type { MessageLink } from '../types/message';
import { isSafeExternalUrl } from './url';

const URL_PATTERN = /https?:\/\/[^\s]+/i;

export function firstUrl(text: string) {
  const match = text.match(URL_PATTERN);
  if (!match) return '';
  const url = match[0].replace(/[),.;!?]+$/, '');
  return isSafeExternalUrl(url) ? url : '';
}

export function siteHost(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function previewImage(url: string) {
  if (siteHost(url) === 'chatx.app') return '/previews/chatx-guide.svg';
  return '';
}

export function linkDraft(url: string): MessageLink {
  const host = siteHost(url);
  let title = host;
  try {
    const path = decodeURIComponent(new URL(url).pathname)
      .replace(/^\//, '')
      .replace(/[-_/]+/g, ' ')
      .trim();
    if (path) title = path;
  } catch {
    title = host;
  }
  return {
    url,
    title,
    description: '',
    image: previewImage(url) || undefined,
    preview: 'notLoaded',
  };
}

export function textParts(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).filter((part) => part.length > 0);
}

const PREVIEW_IMAGE = /^data:image\/(?:jpeg|png|gif|webp);base64,[a-z0-9+/]+={0,2}$/i;

export function readPreviewPayload(data: unknown) {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  const title = typeof row.title === 'string' ? row.title.replace(/\s+/g, ' ').trim().slice(0, 140) : '';
  const description = typeof row.description === 'string' ? row.description.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  const image = typeof row.image === 'string' && row.image.length <= 200_000 && PREVIEW_IMAGE.test(row.image) ? row.image : '';
  if (!title && !description && !image) return null;
  return { title, description, image };
}
