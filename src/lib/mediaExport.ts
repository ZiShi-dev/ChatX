import { Capacitor } from '@capacitor/core';
import { bytesToBase64, clipFileName, localMediaBytes } from './chatFile';
import { StorageAccess } from './storageAccess';
import type { Message } from '../types/message';

/** Types connus ; tout le reste reste application/octet-stream avec l’extension d’origine. */
const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
  htm: 'text/html',
  json: 'application/json',
  xml: 'application/xml',
  zip: 'application/zip',
  '7z': 'application/x-7z-compressed',
  rar: 'application/vnd.rar',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  apk: 'application/vnd.android.package-archive',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  webm: 'video/webm',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  '3gp': 'video/3gpp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  svg: 'image/svg+xml',
};

export function mimeFromFileName(name: string, fallback = 'application/octet-stream') {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  if (!match) return fallback;
  return MIME_BY_EXT[match[1].toLowerCase()] ?? fallback;
}

function defaultMime(message: Message) {
  if (message.type === 'video') return 'video/mp4';
  if (message.type === 'file') return 'application/octet-stream';
  return 'image/jpeg';
}

export function canSaveMessageMedia(message: Message) {
  return (message.type === 'image' || message.type === 'video' || message.type === 'file')
    && message.media?.state === 'cached'
    && !!message.media.localPreviewUrl;
}

export async function mediaFile(message: Message): Promise<File> {
  const source = message.media?.localPreviewUrl;
  if (!source || message.media?.state !== 'cached') throw new Error('media_unavailable');
  if (message.type !== 'image' && message.type !== 'video' && message.type !== 'file') throw new Error('media_unavailable');
  let blob: Blob;
  if (source.startsWith('data:')) {
    const bytes = await localMediaBytes(source);
    blob = new Blob([new Uint8Array(bytes).buffer], { type: source.slice(5, source.indexOf(';')) });
  } else {
    const response = await fetch(source);
    if (!response.ok) throw new Error('media_unavailable');
    blob = await response.blob();
  }
  if (!blob.size || blob.type === 'image/svg+xml' && message.type === 'video') throw new Error('media_unavailable');
  const fallback = defaultMime(message);
  const clipped = clipFileName(message.media.fileName || '');
  const hasOriginalName = clipped.length > 0 && clipped !== 'fichier';
  const typedFromName = hasOriginalName ? mimeFromFileName(clipped, fallback) : fallback;
  const blobType = blob.type && blob.type !== 'application/octet-stream' ? blob.type : '';
  const typed = message.type === 'file' && hasOriginalName
    ? typedFromName
    : hasOriginalName
      ? (typedFromName !== 'application/octet-stream' ? typedFromName : blobType || typedFromName)
      : (blobType || typedFromName);
  const extensionByMime: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
    'video/mp4': 'mp4', 'video/webm': 'webm',
  };
  const defaultExtension = message.type === 'video' ? 'mp4' : message.type === 'image' ? 'jpg' : 'bin';
  const extension = extensionByMime[typed] ?? defaultExtension;
  const name = hasOriginalName
    ? clipped
    : clipFileName(`ChatX-${message.createdAt.replace(/[:.]/g, '-')}-${message.id.slice(0, 8)}.${extension}`);
  return new File([blob], name, { type: typed });
}

export async function saveMessageToPhone(message: Message) {
  return exportMedia(await mediaFile(message));
}

export async function exportMedia(file: File, share = false): Promise<'saved' | 'shared' | 'cancelled'> {
  if (Capacitor.getPlatform() === 'android') {
    const {id} = await StorageAccess.createExport({name:file.name});
    const options = {id,name:file.name,mimeType:file.type};
    let keep = false;
    try {
      // Bound bridge strings and memory even when a locally available video is large.
      for(let offset=0;offset<file.size;offset+=262144) {
        const bytes = new Uint8Array(await file.slice(offset,offset+262144).arrayBuffer());
        await StorageAccess.appendExport({...options,base64:bytesToBase64(bytes)});
      }
      if (share) { await StorageAccess.shareFile(options);keep=true;return 'shared'; }
      const result = await StorageAccess.saveFile(options); return result.cancelled ? 'cancelled' : 'saved';
    } finally { if(!keep)await StorageAccess.discardExport(options).catch(()=>undefined); }
  }
  if (share) {
    if (!navigator.canShare?.({files:[file]})) throw new Error('share_unavailable');
    await navigator.share({files:[file]}); return 'shared';
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a'); link.href = url; link.download = file.name;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url),60_000);
  return 'saved';
}
