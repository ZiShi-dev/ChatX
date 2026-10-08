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
