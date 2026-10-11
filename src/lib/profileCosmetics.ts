export const AVATAR_DECORATIONS = [
  { id: 'none', label: 'بدون إطار' },
  { id: 'orbit', label: 'مدار' },
  { id: 'laurel', label: 'إكليل' },
  { id: 'prism', label: 'منشور' },
  { id: 'hat', label: 'قبعة الخيزران' },
  { id: 'hat-rain', label: 'قبعة المطر' },
  { id: 'dragon', label: 'التنين' },
  { id: 'soul-fire', label: 'جماجم ولهيب الروح' },
] as const;
export type AvatarDecoration = typeof AVATAR_DECORATIONS[number]['id'];
export type ProfileCosmetics = { avatarDecoration?: AvatarDecoration };
export function avatarDecoration(value: unknown): AvatarDecoration {
  return AVATAR_DECORATIONS.find(item => item.id === value)?.id ?? 'none';
}
