import { registerPlugin, WebPlugin } from '@capacitor/core';
import type { NativeOffer } from './appRelease';

type AppReleasePlugin = {
  installApk(options: NativeOffer): Promise<void>;
};

class AppReleaseWeb extends WebPlugin implements AppReleasePlugin {
  async installApk() {
    throw new Error('unavailable');
  }
}

export const AppRelease = registerPlugin<AppReleasePlugin>('AppRelease', {
  web: () => new AppReleaseWeb(),
});
