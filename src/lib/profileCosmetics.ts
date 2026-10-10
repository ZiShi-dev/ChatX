export const AVATAR_DECORATIONS = [
  { id: 'none', label: 'بدون إطار' },
  { id: 'orbit', label: 'مدار' },
  { id: 'laurel', label: 'إكليل' },
  { id: 'prism', label: 'منشور' },
  { id: 'hat', label: 'قبعة الخيزران' },
] as const;
export const PROFILE_EFFECTS = [
  { id: 'none', label: 'بدون تأثير' },
  { id: 'aurora', label: 'شفق' },
  { id: 'stars', label: 'نجوم' },
] as const;
export type AvatarDecoration = typeof AVATAR_DECORATIONS[number]['id'];
export type ProfileEffectId = typeof PROFILE_EFFECTS[number]['id'];
export type ProfileCosmetics = { avatarDecoration?: AvatarDecoration; profileEffect?: ProfileEffectId };
export function avatarDecoration(value: unknown): AvatarDecoration {
  return AVATAR_DECORATIONS.find(item => item.id === value)?.id ?? 'none';
}
export function profileEffect(value: unknown): ProfileEffectId {
  return PROFILE_EFFECTS.find(item => item.id === value)?.id ?? 'none';
}
