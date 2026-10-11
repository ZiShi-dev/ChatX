import { expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { emojiAsset, emojiOnlyCount, emojiParts } from './emoji';
import { EMOJI_GROUPS } from './emojiCatalog';
import { EMOJI_ASSET_KEYS } from './emojiAssets';

it('provides a local illustration for every emoji in the picker and every declared asset', () => {
  for (const emoji of EMOJI_GROUPS.flatMap((group) => group.emojis)) expect(emojiAsset(emoji), emoji).toMatch(/^\/assets\/emoji\/[a-f0-9-]+\.webp\?v=apple-db080716$/);
  for (const key of EMOJI_ASSET_KEYS) expect(existsSync(resolve(process.cwd(), 'public/assets/emoji', `${key}.webp`)), key).toBe(true);
});

it('keeps text, hearts with ZWJ, skin tones and unknown family sequences intact', () => {
  const text = 'مرحبا ❤️‍🔥 👍🏽 👨‍👩‍👧‍👦 🇫🇷 1️⃣ 🫨';
  const parts = emojiParts(text);
  expect(parts.map((part) => part.text).join('')).toBe(text);
  expect(parts.find((part) => part.text === '❤️‍🔥')?.asset).toBeTruthy();
  expect(parts.find((part) => part.text === '👍🏽')?.asset).toBeTruthy();
  expect(parts.find((part) => part.text === '👨‍👩‍👧‍👦')).toEqual({ text: '👨‍👩‍👧‍👦', asset: null });
  expect(parts.find((part) => part.text === '🇫🇷')).toEqual({ text: '🇫🇷', asset: null });
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
  expect(emojiParts('🤝🏻')).toEqual([{ text: '🤝🏻', asset: '/assets/emoji/1f91d-1f3fb.webp?v=apple-db080716' }]);
  expect(emojiAsset('❤')).toBe(emojiAsset('❤️'));
});
