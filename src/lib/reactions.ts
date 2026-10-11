import type { MessageReaction } from '../types/message';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
export const MAX_USER_REACTIONS = 8;

export function applyReaction(reactions: MessageReaction[] | undefined, userId: string, emoji: string) {
  const current = reactions ?? [];
  const mine = current.filter((item) => item.userId === userId);
  if (mine.some((item) => item.emoji === emoji) || mine.length >= MAX_USER_REACTIONS) return current;
  return [...current, { emoji, userId }];
}

export function removeReaction(reactions: MessageReaction[] | undefined, userId: string, emoji: string) {
  return (reactions ?? []).filter((item) => item.userId !== userId || item.emoji !== emoji);
}

export function groupReactions(reactions: MessageReaction[] | undefined) {
  const groups: { emoji: string; userIds: string[] }[] = [];
  for (const item of reactions ?? []) {
    const group = groups.find((entry) => entry.emoji === item.emoji);
    if (group) group.userIds.push(item.userId);
    else groups.push({ emoji: item.emoji, userIds: [item.userId] });
  }
  return groups;
}
