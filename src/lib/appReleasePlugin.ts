import { registerPlugin, WebPlugin } from '@capacitor/core';
type AppReleasePlugin = {
  openPlayStore(): Promise<void>;
};

class AppReleaseWeb extends WebPlugin implements AppReleasePlugin {
  async openPlayStore() {
    throw new Error('unavailable');
  }
}

export const AppRelease = registerPlugin<AppReleasePlugin>('AppRelease', {
  web: () => new AppReleaseWeb(),
});
