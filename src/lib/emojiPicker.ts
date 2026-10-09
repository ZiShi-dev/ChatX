import { EMOJI_GROUPS } from './emojiCatalog';

const emojis = [...new Set(EMOJI_GROUPS.flatMap(group => group.emojis))];
const allowed = new Set(emojis);
const aliases: Record<string, string> = {
  faces: 'face smile happy sad laugh visage sourire rire triste وجه وجوه ضحك ابتسامة حزين',
  hearts: 'heart love coeur amour قلب قلوب حب', hands: 'hand gesture main geste يد إيماءات',
  nature: 'animal nature flower fleur حيوان طبيعة زهرة', food: 'food drink nourriture boisson طعام شراب',
  activity: 'sport game activity jeu نشاط رياضة لعبة', travel: 'travel car voyage voiture سفر سيارة',
  objects: 'object phone objet téléphone أشياء هاتف', symbols: 'symbol flag symbole drapeau رموز علم',
};
const names: Record<string, string> = {
  '😂': 'laugh rire ضحك', '🤣': 'laugh rire ضحك', '😭': 'cry pleurer بكاء', '😢': 'cry sad triste حزين',
  '😊': 'smile sourire ابتسامة', '😀': 'smile happy sourire سعيد', '😍': 'love amour حب',
  '🥰': 'love amour حب', '😘': 'kiss bisous قبلة', '😡': 'angry colère غضب', '😴': 'sleep dormir نوم',
  '👍': 'yes ok oui نعم موافق', '👎': 'no non لا', '🙏': 'thanks merci شكرا', '👋': 'hello salut مرحبا',
};
const normalize = (value: string) => value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f\u064b-\u065f]/g, '').trim();
const index = emojis.map(emoji => ({ emoji, names: normalize(names[emoji] ?? '').split(' '), words: normalize(`${names[emoji] ?? ''} ${EMOJI_GROUPS.filter(group => group.emojis.includes(emoji)).map(group => `${group.label} ${aliases[group.id] ?? ''}`).join(' ')}`) }));
export function searchEmoji(query: string) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const specific = index.filter(item => words.length && words.every(word => item.emoji.includes(word) || item.names.some(name => name.startsWith(word))));
  if (specific.length) return specific.map(item => item.emoji);
  return index.filter(item => words.every(word => item.emoji.includes(word) || item.words.includes(word))).map(item => item.emoji);
}
export function recentEmoji(owner: string): string[] {
  try {
    const raw = localStorage.getItem(`chatx.emojiRecent.${owner}`) || '[]';
    if (raw.length > 4096) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? [...new Set(parsed.filter((item): item is string => typeof item === 'string' && allowed.has(item)))].slice(0, 24) : [];
  } catch { return []; }
}
export function rememberEmoji(owner: string, emoji: string) {
  if (!allowed.has(emoji)) return;
  try { localStorage.setItem(`chatx.emojiRecent.${owner}`, JSON.stringify([emoji, ...recentEmoji(owner).filter(item => item !== emoji)].slice(0, 24))); }
  catch { /* Picking remains available when browser storage is full. */ }
}
