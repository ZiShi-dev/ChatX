import { registerPlugin, WebPlugin } from '@capacitor/core';
import type { NativeOffer } from './appRelease';

type AppReleasePlugin = {
  installedFromPlay(): Promise<{ play: boolean }>;
  openPlayStore(): Promise<void>;
  installApk(options: NativeOffer): Promise<void>;
};

class AppReleaseWeb extends WebPlugin implements AppReleasePlugin {
  async installedFromPlay() {
    return { play: false };
  }

  async openPlayStore() {
    throw new Error('unavailable');
  }

  async installApk() {
    throw new Error('unavailable');
  }
}

export const AppRelease = registerPlugin<AppReleasePlugin>('AppRelease', {
  web: () => new AppReleaseWeb(),
});
