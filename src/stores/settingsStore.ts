import { create } from 'zustand';
import { applyAppearance, DEFAULT_APPEARANCE, sanitizeAppearance, type Appearance } from '../lib/appearance';
import { DEFAULT_NOTIFY_TYPES, type InboxKind, type NotifyTypePrefs } from '../lib/inbox';
import type { ImageQuality, VideoQuality } from '../types/settings';

type Usage = { images: number; videos: number; other: number };

type SettingsStore = {
  dataSaver: boolean;
  autoDownloadImages: boolean;
  autoDownloadVideos: boolean;
  imageQuality: ImageQuality;
  videoQuality: VideoQuality;
  notifyTypes: NotifyTypePrefs;
  showTyping: boolean;
  appearance: Appearance;
  usage: Usage;
  setDataSaver: (value: boolean) => void;
  setAutoDownloadImages: (value: boolean) => void;
  setAutoDownloadVideos: (value: boolean) => void;
  setImageQuality: (value: ImageQuality) => void;
  setVideoQuality: (value: VideoQuality) => void;
  setNotifyType: (kind: InboxKind, enabled: boolean) => void;
  setShowTyping: (value: boolean) => void;
  setAppearance: (patch: Partial<Appearance>) => void;
  resetAppearance: () => void;
  addUsage: (kind: keyof Usage, bytes: number) => void;
  clearCache: () => void;
};

const SETTINGS_KEY = 'chatx.settings';

type SavedSettings = {
  dataSaver: boolean;
  autoDownloadImages: boolean;
  autoDownloadVideos: boolean;
  imageQuality: ImageQuality;
  videoQuality: VideoQuality;
  notifyTypes: NotifyTypePrefs;
  showTyping: boolean;
  appearance: Appearance;
};

function readSaved(): Partial<SavedSettings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<SavedSettings>;
    if (!parsed || typeof parsed !== 'object') return {};
    if (parsed.notifyTypes) {
      parsed.notifyTypes = { ...DEFAULT_NOTIFY_TYPES, ...parsed.notifyTypes };
    }
    if (typeof parsed.showTyping !== 'boolean') delete parsed.showTyping;
    if (parsed.appearance && typeof parsed.appearance === 'object') parsed.appearance = sanitizeAppearance(parsed.appearance);
    else delete parsed.appearance;
    return parsed;
  } catch {
    return {};
  }
}

let appearanceTimer = 0;

function cancelAppearanceWrite() {
  if (!appearanceTimer) return;
  window.clearTimeout(appearanceTimer);
  appearanceTimer = 0;
}

function writeSaved(state: Pick<SettingsStore, keyof SavedSettings>) {
  const payload: SavedSettings = {
    dataSaver: state.dataSaver,
    autoDownloadImages: state.autoDownloadImages,
    autoDownloadVideos: state.autoDownloadVideos,
    imageQuality: state.imageQuality,
    videoQuality: state.videoQuality,
    notifyTypes: state.notifyTypes,
    showTyping: state.showTyping,
    appearance: state.appearance,
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  } catch {
    // Keep settings usable in memory when storage is full or unavailable.
  }
}

function writeSavedNow(state: Pick<SettingsStore, keyof SavedSettings>) {
  cancelAppearanceWrite();
  writeSaved(state);
}

function writeSavedSoon() {
  cancelAppearanceWrite();
  appearanceTimer = window.setTimeout(() => {
    appearanceTimer = 0;
    writeSaved(useSettingsStore.getState());
  }, 400);
}

function flushAppearanceWrite() {
  if (!appearanceTimer) return;
  cancelAppearanceWrite();
  writeSaved(useSettingsStore.getState());
}

const saved = readSaved();

export const useSettingsStore = create<SettingsStore>((set) => ({
  dataSaver: saved.dataSaver ?? true,
  autoDownloadImages: saved.autoDownloadImages ?? false,
  autoDownloadVideos: saved.autoDownloadVideos ?? false,
  imageQuality: saved.imageQuality ?? 'saver',
  videoQuality: saved.videoQuality ?? '480',
  notifyTypes: saved.notifyTypes ?? DEFAULT_NOTIFY_TYPES,
  showTyping: saved.showTyping ?? true,
  appearance: saved.appearance ?? DEFAULT_APPEARANCE,
  usage: { images: 0, videos: 0, other: 0 },
  setDataSaver: (dataSaver) => set((state) => {
    const next = { ...state, dataSaver };
    writeSavedNow(next);
    return { dataSaver };
  }),
  setAutoDownloadImages: (autoDownloadImages) => set((state) => {
    const next = { ...state, autoDownloadImages };
    writeSavedNow(next);
    return { autoDownloadImages };
  }),
  setAutoDownloadVideos: (autoDownloadVideos) => set((state) => {
    const next = { ...state, autoDownloadVideos };
    writeSavedNow(next);
    return { autoDownloadVideos };
  }),
  setImageQuality: (imageQuality) => set((state) => {
    const next = { ...state, imageQuality };
    writeSavedNow(next);
    return { imageQuality };
  }),
  setVideoQuality: (videoQuality) => set((state) => {
    const next = { ...state, videoQuality };
    writeSavedNow(next);
    return { videoQuality };
  }),
  setNotifyType: (kind, enabled) => set((state) => {
    const notifyTypes = { ...state.notifyTypes, [kind]: enabled };
    writeSavedNow({ ...state, notifyTypes });
    return { notifyTypes };
  }),
  setShowTyping: (showTyping) => set((state) => {
    writeSavedNow({ ...state, showTyping });
    return { showTyping };
  }),
  setAppearance: (patch) => set((state) => {
    const appearance = sanitizeAppearance({ ...state.appearance, ...patch });
    applyAppearance(appearance);
    if ('logo' in patch || 'wallpaper' in patch) writeSavedNow({ ...state, appearance });
    else writeSavedSoon();
    return { appearance };
  }),
  resetAppearance: () => set((state) => {
    const appearance = sanitizeAppearance(DEFAULT_APPEARANCE);
    applyAppearance(appearance);
    writeSavedNow({ ...state, appearance });
    return { appearance };
  }),
  addUsage: (kind, bytes) =>
    set((state) => ({ usage: { ...state.usage, [kind]: state.usage[kind] + bytes } })),
  clearCache: () => set({ usage: { images: 0, videos: 0, other: 0 } }),
}));

applyAppearance(useSettingsStore.getState().appearance);

window.addEventListener('pagehide', flushAppearanceWrite);
