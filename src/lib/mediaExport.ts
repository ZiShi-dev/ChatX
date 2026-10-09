import { Capacitor } from '@capacitor/core';
import { bytesToBase64, clipFileName, localMediaBytes } from './chatFile';
import { StorageAccess } from './storageAccess';
import type { Message } from '../types/message';

export async function mediaFile(message: Message): Promise<File> {
  const source = message.media?.localPreviewUrl;
  if (!source || message.media?.state !== 'cached') throw new Error('media_unavailable');
  let blob: Blob;
  if (source.startsWith('data:')) {
    const bytes = await localMediaBytes(source);
    blob = new Blob([new Uint8Array(bytes).buffer], {type: source.slice(5,source.indexOf(';'))});
  } else {
    const response = await fetch(source);
    if (!response.ok) throw new Error('media_unavailable');
    blob = await response.blob();
  }
  if (!blob.size || blob.type === 'image/svg+xml' && message.type === 'video') throw new Error('media_unavailable');
  const extension = ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg','video/mp4':'mp4','video/webm':'webm'} as Record<string,string>)[blob.type] ?? (message.type === 'video' ? 'mp4' : 'jpg');
  const name = clipFileName(message.media.fileName || `ChatX-${message.createdAt.replace(/[:.]/g,'-')}-${message.id.slice(0,8)}.${extension}`);
  return new File([blob], name, {type:blob.type || (message.type === 'video' ? 'video/mp4' : 'image/jpeg')});
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
