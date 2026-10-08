import { create } from 'zustand';
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
  usage: Usage;
  setDataSaver: (value: boolean) => void;
  setAutoDownloadImages: (value: boolean) => void;
  setAutoDownloadVideos: (value: boolean) => void;
  setImageQuality: (value: ImageQuality) => void;
  setVideoQuality: (value: VideoQuality) => void;
  setNotifyType: (kind: InboxKind, enabled: boolean) => void;
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
    return parsed;
  } catch {
    return {};
  }
}

function writeSaved(state: Pick<SettingsStore, keyof SavedSettings>) {
  const payload: SavedSettings = {
    dataSaver: state.dataSaver,
    autoDownloadImages: state.autoDownloadImages,
    autoDownloadVideos: state.autoDownloadVideos,
    imageQuality: state.imageQuality,
    videoQuality: state.videoQuality,
    notifyTypes: state.notifyTypes,
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  } catch {
    // Keep settings usable in memory when storage is full or unavailable.
  }
}

const saved = readSaved();

export const useSettingsStore = create<SettingsStore>((set) => ({
  dataSaver: saved.dataSaver ?? true,
  autoDownloadImages: saved.autoDownloadImages ?? false,
  autoDownloadVideos: saved.autoDownloadVideos ?? false,
  imageQuality: saved.imageQuality ?? 'saver',
  videoQuality: saved.videoQuality ?? '480',
  notifyTypes: saved.notifyTypes ?? DEFAULT_NOTIFY_TYPES,
  usage: { images: 0, videos: 0, other: 0 },
  setDataSaver: (dataSaver) => set((state) => {
    const next = { ...state, dataSaver };
    writeSaved(next);
    return { dataSaver };
  }),
  setAutoDownloadImages: (autoDownloadImages) => set((state) => {
    const next = { ...state, autoDownloadImages };
    writeSaved(next);
    return { autoDownloadImages };
  }),
  setAutoDownloadVideos: (autoDownloadVideos) => set((state) => {
    const next = { ...state, autoDownloadVideos };
    writeSaved(next);
    return { autoDownloadVideos };
  }),
  setImageQuality: (imageQuality) => set((state) => {
    const next = { ...state, imageQuality };
    writeSaved(next);
    return { imageQuality };
  }),
  setVideoQuality: (videoQuality) => set((state) => {
    const next = { ...state, videoQuality };
    writeSaved(next);
    return { videoQuality };
  }),
  setNotifyType: (kind, enabled) => set((state) => {
    const notifyTypes = { ...state.notifyTypes, [kind]: enabled };
    writeSaved({ ...state, notifyTypes });
    return { notifyTypes };
  }),
  addUsage: (kind, bytes) =>
    set((state) => ({ usage: { ...state.usage, [kind]: state.usage[kind] + bytes } })),
  clearCache: () => set({ usage: { images: 0, videos: 0, other: 0 } }),
}));
