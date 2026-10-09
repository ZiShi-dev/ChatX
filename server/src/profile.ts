import { safeJpeg } from './jpeg.ts';
const BIO_MAX = 160;
const BANNER_MAX = 180_000;
const AVATAR_MAX = 80_000;
const JPEG_PREFIX = 'data:image/jpeg;base64,/9j/';

export function cleanBio(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (text.length > BIO_MAX) return null;
  return text;
}

function cleanJpeg(value: unknown, max: number): { ok: true; value: string | null } | { ok: false } {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string' || value.length < JPEG_PREFIX.length + 4 || value.length > max) return { ok: false };
  if (!value.startsWith(JPEG_PREFIX)) return { ok: false };
  const data = value.slice('data:image/jpeg;base64,'.length);
  if (data.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return { ok: false };
  if(!safeJpeg(Buffer.from(data,'base64')))return {ok:false};
  return { ok: true, value };
}

export function cleanBanner(value: unknown) {
  return cleanJpeg(value, BANNER_MAX);
}

export function cleanAvatar(value: unknown) {
  return cleanJpeg(value, AVATAR_MAX);
}
