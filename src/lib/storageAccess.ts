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
  requestAccess(): Promise<{ granted: boolean }>;
  listDirectory(options: { path: string }): Promise<{ files: StorageFile[] }>;
  listEntries(options: { path: string }): Promise<{ entries: StorageEntry[] }>;
};

class StorageAccessWeb extends WebPlugin implements StorageAccessPlugin {
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
