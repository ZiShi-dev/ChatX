import type { MessageReaction } from '../types/message';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

export function applyReaction(reactions: MessageReaction[] | undefined, userId: string, emoji: string) {
  const current = reactions ?? [];
  const mine = current.find((item) => item.userId === userId);
  if (mine?.emoji === emoji) return current.filter((item) => item.userId !== userId);
  return [...current.filter((item) => item.userId !== userId), { emoji, userId }];
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
