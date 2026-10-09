import { registerPlugin, WebPlugin } from '@capacitor/core';

export type StorageFile = {
  name: string;
  mimeType: string;
  size: number;
  path?: string;
  webPath?: string;
};

export type StorageEntry = StorageFile & {
  kind: 'file' | 'directory';
};

type StorageAccessPlugin = {
  createExport(options: {name:string}): Promise<{id:string}>;
  appendExport(options: {id:string;name:string;base64:string}): Promise<void>;
  discardExport(options: {id:string;name:string}): Promise<void>;
  saveFile(options: { id:string; name: string; mimeType: string }): Promise<{ cancelled?: boolean }>;
  shareFile(options: { id:string; name: string; mimeType: string }): Promise<void>;
  requestAccess(): Promise<{ granted: boolean }>;
  listDirectory(options: { path: string }): Promise<{ files: StorageFile[] }>;
  listEntries(options: { path: string }): Promise<{ entries: StorageEntry[] }>;
};

class StorageAccessWeb extends WebPlugin implements StorageAccessPlugin {
  async createExport(): Promise<{id:string}> { throw new Error('native_only'); }
  async appendExport(): Promise<void> { throw new Error('native_only'); }
  async discardExport(): Promise<void> { throw new Error('native_only'); }
  async saveFile(): Promise<{ cancelled?: boolean }> { throw new Error('native_only'); }
  async shareFile(): Promise<void> { throw new Error('native_only'); }
  async requestAccess() {
    return { granted: true };
  }

  async listDirectory() {
    return { files: [] };
  }

  async listEntries() {
    return { entries: [] };
  }
}

export const StorageAccess = registerPlugin<StorageAccessPlugin>('StorageAccess', {
  web: () => new StorageAccessWeb(),
});
