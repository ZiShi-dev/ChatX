import { afterEach, expect, it, vi } from 'vitest';
import { mediaFile, exportMedia } from './mediaExport';
import type { Message } from '../types/message';
import { Capacitor } from '@capacitor/core';

const native = vi.hoisted(()=>({createExport:vi.fn(),appendExport:vi.fn(),discardExport:vi.fn(),saveFile:vi.fn(),shareFile:vi.fn()}));
vi.mock('./storageAccess',()=>({StorageAccess:native}));

afterEach(()=>vi.restoreAllMocks());
const message:Message={id:'image-id',conversationId:'room',senderId:'alice',type:'image',status:'sent',createdAt:'2026-10-09T12:00:00Z',media:{state:'cached',fileSize:3,localPreviewUrl:'data:image/png;base64,AP+A'}};
it('exports the cached bytes and actual image format without downloading again',async()=>{
  const fetchMock=vi.spyOn(globalThis,'fetch');
  const file=await mediaFile(message);
  expect(file.name).toMatch(/\.png$/);expect(file.type).toBe('image/png');expect(file.size).toBe(3);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('does not export a remote thumbnail or a simulated video as an actual video',async()=>{
  await expect(mediaFile({...message,media:{...message.media!,state:'remote'}})).rejects.toThrow('media_unavailable');
  await expect(mediaFile({...message,type:'video',media:{...message.media!,localPreviewUrl:'data:image/svg+xml;base64,AP+A'}})).rejects.toThrow('media_unavailable');
});
it('reports unavailable file sharing instead of sending only a private URL',async()=>{
  await expect(exportMedia(new File(['photo'],'photo.png',{type:'image/png'}),true)).rejects.toThrow('share_unavailable');
});
it('bounds Android bridge chunks and clears the temporary file when saving is cancelled',async()=>{
  vi.spyOn(Capacitor,'getPlatform').mockReturnValue('android');
  native.createExport.mockResolvedValue({id:'export-id'});native.appendExport.mockResolvedValue(undefined);
  native.saveFile.mockResolvedValue({cancelled:true});native.discardExport.mockResolvedValue(undefined);
  const file={name:'clip.webm',type:'video/webm',size:600000,slice:(start:number,end:number)=>({arrayBuffer:async()=>new Uint8Array(Math.min(end,600000)-start).buffer})} as File;
  expect(await exportMedia(file)).toBe('cancelled');
  expect(native.appendExport).toHaveBeenCalledTimes(3);
  expect(native.appendExport.mock.calls.every(([options])=>options.base64.length<=349528)).toBe(true);
  expect(native.discardExport).toHaveBeenCalledWith({id:'export-id',name:'clip.webm',mimeType:'video/webm'});
});
