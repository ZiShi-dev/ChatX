export const EVERYONE_HANDLE = 'everyone';

const ACTIVE = /(^|\s)@([\p{L}\p{N}_]*)$/u;
const HANDLE = /(?:^|\s)@([\p{L}\p{N}_]+)/gu;

export function activeMention(value: string, cursor: number) {
  const match = value.slice(0, cursor).match(ACTIVE);
  if (!match) return null;
  return {
    query: match[2],
    start: cursor - match[2].length - 1,
  };
}

export function mentionedHandles(text: string) {
  return [...text.matchAll(HANDLE)].map((match) => match[1].toLowerCase());
}

export function mentionTone(text: string, username: string) {
  const handles = new Set(mentionedHandles(text));
  if (username && handles.has(username.toLowerCase())) return 'direct' as const;
  if (handles.has(EVERYONE_HANDLE)) return 'everyone' as const;
  return null;
}
