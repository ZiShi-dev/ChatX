import { create } from 'zustand';

const MUTE_KEY = 'chatx.mutes';

export type NotifyLevel = 'all' | 'mentions' | 'everyone' | 'none' | 'custom';

export type RoomKind = 'message' | 'mention' | 'reply' | 'everyone' | 'signal' | 'reaction';

export const ROOM_KINDS: RoomKind[] = ['message', 'mention', 'reply', 'everyone', 'signal', 'reaction'];

export const ROOM_NOTIFY_LEVELS: Array<{ id: NotifyLevel; label: string; hint: string }> = [
  { id: 'all', label: 'كل الرسائل', hint: 'كل رسالة جديدة' },
  { id: 'mentions', label: 'الإشارات والردود فقط', hint: 'عندما يُذكر اسمك أو يرد أحد على رسالتك' },
  { id: 'none', label: 'مكتوم', hint: 'تبقى ظاهرة في الإشعارات، بدون تنبيه' },
];

export type ChatMute = {
  conversationId: string;
  level: Exclude<NotifyLevel, 'all'>;
  off?: RoomKind[];
};

type MuteStore = {
  mutes: ChatMute[];
  setLevel: (conversationId: string, level: NotifyLevel) => void;
  setKind: (conversationId: string, kind: RoomKind, enabled: boolean) => void;
  setKinds: (conversationId: string, kinds: RoomKind[], enabled: boolean) => void;
  blocks: (conversationId: string, mention?: boolean | RoomKind) => boolean;
};

const KIND_SET = new Set<RoomKind>(ROOM_KINDS);

function sameKinds(left: RoomKind[], right: RoomKind[]) {
  return left.length === right.length && left.every((kind) => right.includes(kind));
}

function legacyOff(level: NotifyLevel): RoomKind[] {
  if (level === 'none') return [...ROOM_KINDS];
  if (level === 'mentions') return ROOM_KINDS.filter((kind) => kind !== 'mention' && kind !== 'reply');
  if (level === 'everyone') return ROOM_KINDS.filter((kind) => kind !== 'everyone' && kind !== 'mention');
  return [];
}

function preset(off: RoomKind[]): NotifyLevel {
  if (off.length === 0) return 'all';
  if (sameKinds(off, ROOM_KINDS)) return 'none';
  if (sameKinds(off, legacyOff('mentions'))) return 'mentions';
  if (sameKinds(off, legacyOff('everyone'))) return 'everyone';
  return 'custom';
}

export function kindsOff(mute?: ChatMute): RoomKind[] {
  if (!mute) return [];
  if (mute.level === 'custom') return mute.off ?? [];
  return legacyOff(mute.level);
}

export function roomAllows(mutes: ChatMute[], conversationId: string, kind: RoomKind) {
  return !kindsOff(mutes.find((item) => item.conversationId === conversationId)).includes(kind);
}

export function quietLevel(mute: ChatMute) {
  if (mute.level !== 'custom') return mute.level;
  return `off:${(mute.off ?? []).join('.')}`;
}

function readMutes(): ChatMute[] {
  try {
    const raw = localStorage.getItem(MUTE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMute[];
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): ChatMute[] => {
      if (!item || typeof item.conversationId !== 'string') return [];
      if (item.level !== 'mentions' && item.level !== 'everyone' && item.level !== 'none' && item.level !== 'custom') return [];
      if (item.level !== 'custom') return [{ conversationId: item.conversationId, level: item.level }];
      const off = Array.isArray(item.off) ? item.off.filter((kind): kind is RoomKind => KIND_SET.has(kind)) : [];
      return off.length === 0 ? [] : [{ conversationId: item.conversationId, level: 'custom' as const, off }];
    });
  } catch {
    return [];
  }
}

function writeLevel(conversationId: string, off: RoomKind[]) {
  const level = preset(off);
  const mutes = [
    ...useMuteStore.getState().mutes.filter((item) => item.conversationId !== conversationId),
    ...(level === 'all' ? [] : [{
      conversationId,
      level,
      ...(level === 'custom' ? { off } : {}),
    } as ChatMute]),
  ];
  try {
    localStorage.setItem(MUTE_KEY, JSON.stringify(mutes));
  } catch {
    // Muting still works for this session if local storage is unavailable.
  }
  useMuteStore.setState({ mutes });
}

export const useMuteStore = create<MuteStore>((_set, get) => ({
  mutes: readMutes(),
  setLevel: (conversationId, level) => {
    writeLevel(conversationId, legacyOff(level));
  },
  setKind: (conversationId, kind, enabled) => {
    const off = new Set(kindsOff(get().mutes.find((item) => item.conversationId === conversationId)));
    if (enabled) off.delete(kind);
    else off.add(kind);
    writeLevel(conversationId, ROOM_KINDS.filter((item) => off.has(item)));
  },
  setKinds: (conversationId, kinds, enabled) => {
    const off = new Set(kindsOff(get().mutes.find((item) => item.conversationId === conversationId)));
    kinds.forEach((kind) => {
      if (enabled) off.delete(kind);
      else off.add(kind);
    });
    writeLevel(conversationId, ROOM_KINDS.filter((item) => off.has(item)));
  },
  blocks: (conversationId, mention = false) => {
    const kind: RoomKind = mention === true || mention === 'mention'
      ? 'mention'
      : mention === 'reply' || mention === 'everyone' || mention === 'signal' || mention === 'reaction' || mention === 'message'
        ? mention
        : 'message';
    return !roomAllows(get().mutes, conversationId, kind);
  },
}));

export function notifyLevel(mutes: ChatMute[], conversationId: string): NotifyLevel {
  return mutes.find((item) => item.conversationId === conversationId)?.level ?? 'all';
}
