import { expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { emojiAsset, emojiOnlyCount, emojiParts } from './emoji';
import { EMOJI_GROUPS } from './emojiCatalog';
import { EMOJI_ASSET_KEYS } from './emojiAssets';
import { APPLE_EMOJI_CATEGORIES } from './appleEmojiCatalog';

it('provides a local illustration for every emoji in the picker and every declared asset', () => {
  for (const emoji of Object.values(APPLE_EMOJI_CATEGORIES).flat()) {
    expect(EMOJI_GROUPS.some(group => group.emojis.includes(emoji)), emoji).toBe(true);
    expect(emojiAsset(emoji), emoji).toMatch(/^\/assets\/emoji\/[a-f0-9-]+\.webp\?v=apple-complete-v3$/);
    expect(emojiParts(emoji), emoji).toEqual([{ text: emoji, asset: emojiAsset(emoji) }]);
  }
  for (const key of EMOJI_ASSET_KEYS) expect(existsSync(resolve(process.cwd(), 'public/assets/emoji', `${key}.webp`)), key).toBe(true);
});

it('keeps text, hearts with ZWJ, skin tones and unknown family sequences intact', () => {
  const text = 'مرحبا ❤️‍🔥 👍🏽 👨‍👩‍👧‍👦 🇫🇷 1️⃣ 🫨';
  const parts = emojiParts(text);
  expect(parts.map((part) => part.text).join('')).toBe(text);
  expect(parts.find((part) => part.text === '❤️‍🔥')?.asset).toBeTruthy();
  expect(parts.find((part) => part.text === '👍🏽')?.asset).toBeTruthy();
  expect(parts.find((part) => part.text === '👨‍👩‍👧‍👦')?.asset).toBeTruthy();
  expect(parts.find((part) => part.text === '🇫🇷')?.asset).toBeTruthy();
  expect(parts.find((part) => part.text === '1️⃣')?.text).toBe('1️⃣');
});

it('counts a message made only of emoji', () => {
  expect(emojiOnlyCount('😀')).toBe(1);
  expect(emojiOnlyCount('😀 👍🏽')).toBe(2);
  expect(emojiOnlyCount('مرحبا 😀')).toBe(0);
  expect(emojiOnlyCount('😀!')).toBe(0);
  expect(emojiOnlyCount('   ')).toBe(0);
});

it('honors text presentation and keeps a toned handshake as one picture', () => {
  expect(emojiAsset('✈︎')).toBeNull();
  expect(emojiParts('🤝🏻')[0]?.asset).toBeTruthy();
  expect(emojiAsset('❤')).toBe(emojiAsset('❤️'));
});

it('includes all categories, skin tones and animals while excluding the requested flag', () => {
  for (const emoji of ['🦧', '🦦', '🦔', '🦩', '🪲', '🐈‍⬛', '👨‍👩‍👧‍👦', '🧑‍🚀', '👍']) expect(emojiAsset(emoji), emoji).toBeTruthy();
  for (const emoji of ['🇫🇷', '❤️', '🍎', '🚗', '👍🏽']) expect(emojiAsset(emoji), emoji).toBeTruthy();
  expect(emojiAsset('🇮🇱')).toBeNull();
  expect(EMOJI_GROUPS.some(group => group.emojis.includes('🇮🇱'))).toBe(false);
  expect(EMOJI_ASSET_KEYS.size).toBe(3772);
});
