/// <reference types="@capawesome/capacitor-live-update" />

import type { CapacitorConfig } from '@capacitor/cli';

const updatePublicKey = '-----BEGIN PUBLIC KEY-----MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAjKEU1Gnw1Pvj9/XSCRjNU8ZZvxp+dqVV5SiJh5/Fx2C2GUNSYK7G/S/7S6aiFCKH5lBUaEChhfOWRkA9aNquze6wn287vsXqEZK8Q/WjEhytt9zFOmQpp5Sm6nutjNEvENxChPiCcKrJVjmhoIfQTQTnyQGUxKXKzfPlg2L/3tKanlfYuReiWPmFaCdMvBo8NLoIa+kpz2iYDfTGYqfpDzpLuwOg3s0COGotC0La20MZeUUqVAcadu9BSQOrcr1lCea74JVFCFroPBHwtj3udQcWQc2p9Nw6mEyoJqMiKD05a+GZMnk2YB+RnJRj7jWrALMrjjV/edCrAUC6fs189wIDAQAB-----END PUBLIC KEY-----';

const config: CapacitorConfig = {
  appId: 'app.chatx.mobile',
  appName: 'ChatX',
  webDir: 'dist',
  plugins: {
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
    LiveUpdate: {
      publicKey: updatePublicKey,
      readyTimeout: 20000,
      httpTimeout: 180000,
      autoDeleteBundles: true,
      autoBlockRolledBackBundles: true,
    },
  },
};

export default config;
