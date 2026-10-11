export const AVATAR_DECORATIONS = [
  { id: 'none', label: 'بدون إطار' },
  { id: 'orbit', label: 'مدار' },
  { id: 'laurel', label: 'إكليل' },
  { id: 'prism', label: 'منشور' },
  { id: 'hat', label: 'قبعة الخيزران' },
  { id: 'hat-rain', label: 'قبعة المطر' },
  { id: 'dragon', label: 'التنين' },
] as const;
export const PROFILE_EFFECTS = [
  { id: 'none', label: 'بدون تأثير' },
  { id: 'aurora', label: 'شفق' },
  { id: 'stars', label: 'نجوم' },
  { id: 'meteors', label: 'شهب' },
  { id: 'celestial-dragon', label: 'التنين السماوي' },
  { id: 'sword-domain', label: 'تشكيل السيوف' },
  { id: 'time-cicada', label: 'زيز الزمن' },
  { id: 'jade-lotus', label: 'لوتس اليشم' },
  { id: 'heavenly-tribulation', label: 'المحنة السماوية' },
  { id: 'jade-petals', label: 'تساقط البتلات' },
  { id: 'spirit-embers', label: 'جمرات الروح' },
] as const;
const BANNER_SCENES = ['celestial-dragon', 'sword-domain', 'time-cicada', 'jade-lotus', 'heavenly-tribulation', 'jade-petals', 'spirit-embers'] as const;
export type BannerScene = (typeof BANNER_SCENES)[number];
export function isBannerScene(effect: ProfileEffectId): effect is BannerScene {
  return (BANNER_SCENES as readonly string[]).includes(effect);
}
export type AvatarDecoration = typeof AVATAR_DECORATIONS[number]['id'];
export type ProfileEffectId = typeof PROFILE_EFFECTS[number]['id'];
export type ProfileCosmetics = { avatarDecoration?: AvatarDecoration; profileEffect?: ProfileEffectId };
export function avatarDecoration(value: unknown): AvatarDecoration {
  return AVATAR_DECORATIONS.find(item => item.id === value)?.id ?? 'none';
}
export function profileEffect(value: unknown): ProfileEffectId {
  return PROFILE_EFFECTS.find(item => item.id === value)?.id ?? 'none';
}
