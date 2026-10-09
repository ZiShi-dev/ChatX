import { create } from 'zustand';
import { isServerId } from '../lib/home';
import { readSavedPayload, toggleSaved, type SavedEntry } from '../lib/saved';
import { adminFetch } from '../lib/adminApi';
import { useAuthStore } from './authStore';

const SAVED_KEY = 'chatx.saved';
const changing = new Set<string>();
let accountVersion = 0;

function readSaved(userId = useAuthStore.getState().currentUser.id): SavedEntry[] {
  try {
    const raw = localStorage.getItem(`${SAVED_KEY}:${userId}`) ?? localStorage.getItem(SAVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedEntry => {
      if (!item || typeof item !== 'object') return false;
      const entry = item as SavedEntry;
      return typeof entry.messageId === 'string' && entry.userId === userId && typeof entry.conversationId === 'string';
    });
  } catch {
    return [];
  }
}

function writeSaved(entries: SavedEntry[]) {
  try {
    const me = useAuthStore.getState().currentUser.id;
    localStorage.setItem(`${SAVED_KEY}:${me}`, JSON.stringify(entries.filter((entry) => entry.userId === me)));
  } catch {
    // Keep saved messages usable in memory when device storage is full.
  }
}

type SavedStore = {
  entries: SavedEntry[];
  hasMore: boolean;
  lastError: string;
  load: (older?: boolean) => Promise<void>;
  toggle: (entry: SavedEntry) => void;
  remove: (userId: string, messageId: string) => void;
};

function keepOnServer(messageId: string, saved: boolean) {
  return adminFetch('/api/saved', { method: 'POST', body: { messageId, saved } });
}

export const useSavedStore = create<SavedStore>((set, get) => ({
  entries: useAuthStore.getState().activated ? readSaved() : [],
  hasMore: false,
  lastError: '',
  load: async (older) => {
    const version = accountVersion;
    const me = useAuthStore.getState().currentUser.id;
    if (!isServerId(me)) return;
    const last = get().entries.filter((entry) => entry.userId === me).at(-1);
    const payload = await adminFetch(`/api/saved${older && last ? `?beforeId=${encodeURIComponent(last.messageId)}` : ''}`);
    if (version !== accountVersion || me !== useAuthStore.getState().currentUser.id) return;
    const items = readSavedPayload(payload, me);
    if (!items) return;
    set((state) => {
      const entries = older
        ? [...state.entries, ...items.filter((item) => !state.entries.some((entry) => entry.userId === me && entry.messageId === item.messageId))]
        : [...items, ...state.entries.filter((entry) => entry.userId !== me)];
      writeSaved(entries);
      return { entries, hasMore: Boolean((payload as { hasMore?: unknown }).hasMore) };
    });
  },
  toggle: (entry) => {
    if (!useAuthStore.getState().activated || entry.userId !== useAuthStore.getState().currentUser.id) return;
    const version = accountVersion;
    const key = `${entry.userId}:${entry.messageId}`;
    if (changing.has(key)) return;
    const removing = get().entries.some((item) => item.userId === entry.userId && item.messageId === entry.messageId);
    set((state) => {
      const entries = toggleSaved(state.entries, entry);
      writeSaved(entries);
      return { entries };
    });
    if (!isServerId(entry.userId) || !isServerId(entry.messageId)) return;
    changing.add(key);
    void keepOnServer(entry.messageId, !removing).catch(() => {
      if (version !== accountVersion) return;
      set((state) => {
        const entries = toggleSaved(state.entries, entry);
        writeSaved(entries);
        return { entries, lastError: 'تعذر حفظ الرسالة. أعد المحاولة.' };
      });
    }).finally(() => changing.delete(key));
  },
  remove: (userId, messageId) => {
    if (!useAuthStore.getState().activated || userId !== useAuthStore.getState().currentUser.id) return;
    const version = accountVersion;
    const key = `${userId}:${messageId}`;
    if (changing.has(key)) return;
    const previous = get().entries.find((item) => item.userId === userId && item.messageId === messageId);
    set((state) => {
      const entries = state.entries.filter((item) => item.userId !== userId || item.messageId !== messageId);
      writeSaved(entries);
      return { entries };
    });
    if (!previous || !isServerId(userId) || !isServerId(messageId)) return;
    changing.add(key);
    void keepOnServer(messageId, false).catch(() => {
      if (version !== accountVersion) return;
      set((state) => {
        const entries = [previous, ...state.entries.filter((item) => item.userId !== userId || item.messageId !== messageId)];
        writeSaved(entries);
        return { entries, lastError: 'تعذر إلغاء الحفظ. أعد المحاولة.' };
      });
    }).finally(() => changing.delete(key));
  },
}));

useAuthStore.subscribe((state, previous) => {
  if (state.currentUser.id === previous.currentUser.id && state.activated === previous.activated) return;
  accountVersion += 1;
  useSavedStore.setState({ entries: state.activated ? readSaved(state.currentUser.id) : [], hasMore: false, lastError: '' });
});
