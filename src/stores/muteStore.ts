import { create } from 'zustand';

const MUTE_KEY = 'chatx.mutes';

export type NotifyLevel = 'all' | 'mentions' | 'everyone' | 'none';

export const ROOM_NOTIFY_LEVELS: Array<{ id: NotifyLevel; label: string; hint: string }> = [
  { id: 'all', label: 'كل الرسائل', hint: 'كل رسالة جديدة' },
  { id: 'mentions', label: 'الإشارات والردود فقط', hint: 'عندما يُذكر اسمك أو يرد أحد على رسالتك' },
  { id: 'none', label: 'مكتوم', hint: 'تبقى ظاهرة في الإشعارات، بدون تنبيه' },
];

export type ChatMute = {
  conversationId: string;
  level: Exclude<NotifyLevel, 'all'>;
};

type MuteStore = {
  mutes: ChatMute[];
  setLevel: (conversationId: string, level: NotifyLevel) => void;
  blocks: (conversationId: string, mention?: boolean | 'everyone' | 'reply') => boolean;
};

function readMutes(): ChatMute[] {
  try {
    const raw = localStorage.getItem(MUTE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMute[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.conversationId === 'string' && (item.level === 'mentions' || item.level === 'everyone' || item.level === 'none'));
  } catch {
    return [];
  }
}

export const useMuteStore = create<MuteStore>((set, get) => ({
  mutes: readMutes(),
  setLevel: (conversationId, level) => {
    const mutes = [
      ...get().mutes.filter((item) => item.conversationId !== conversationId),
      ...(level === 'all' ? [] : [{ conversationId, level } as ChatMute]),
    ];
    try {
      localStorage.setItem(MUTE_KEY, JSON.stringify(mutes));
    } catch {
      // Muting still works for this session if local storage is unavailable.
    }
    set({ mutes });
  },
  blocks: (conversationId, mention = false) => {
    const level = get().mutes.find((item) => item.conversationId === conversationId)?.level ?? 'all';
    if (level === 'none') return true;
    if (level === 'mentions') return mention !== true && mention !== 'reply';
    if (level === 'everyone') return mention !== 'everyone';
    return false;
  },
}));

export function notifyLevel(mutes: ChatMute[], conversationId: string): NotifyLevel {
  return mutes.find((item) => item.conversationId === conversationId)?.level ?? 'all';
}
