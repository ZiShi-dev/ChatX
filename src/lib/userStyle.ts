import type { CSSProperties } from 'react';
import type { MessageFontId } from '../types/user';

export const USER_COLOR_OPTIONS = [
  '#3d9b84',
  '#4d7ea8',
  '#528fba',
  '#6f8f72',
  '#4f8f6a',
  '#5f8f8a',
  '#a56b7a',
  '#9b5a7c',
  '#c4893a',
  '#d97838',
  '#7d6b9a',
  '#b08968',
] as const;

export const MESSAGE_FONT_OPTIONS: Array<{ id: MessageFontId; label: string; family: string }> = [
  { id: 'system', label: 'افتراضي', family: 'inherit' },
  { id: 'clear', label: 'واضح', family: '"ChatX Tajawal", Tahoma, sans-serif' },
  { id: 'rounded', label: 'ناعم', family: '"ChatX Cairo", Tahoma, sans-serif' },
  { id: 'classic', label: 'كلاسيكي', family: '"ChatX Amiri", Georgia, serif' },
];

const FONT_IDS = new Set(MESSAGE_FONT_OPTIONS.map((item) => item.id));

export function sanitizeUserColor(value: unknown, fallback: string = USER_COLOR_OPTIONS[0]) {
  if (typeof value !== 'string') return fallback;
  const hex = value.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(hex)) return fallback;
  return hex;
}

export function normalizeUserColorInput(value: string, fallback: string) {
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
  if (/^[0-9a-f]{6}$/.test(trimmed)) return `#${trimmed}`;
  return sanitizeUserColor(trimmed, fallback);
}

export function sanitizeMessageFont(value: unknown): MessageFontId {
  return typeof value === 'string' && FONT_IDS.has(value as MessageFontId) ? value as MessageFontId : 'system';
}

export function messageFontFamily(id?: MessageFontId) {
  const font = MESSAGE_FONT_OPTIONS.find((item) => item.id === sanitizeMessageFont(id));
  return font && font.id !== 'system' ? font.family : undefined;
}

/** Style for the display name above bubbles (not the bubble body). */
export function displayNameFontClass(fontId?: MessageFontId) {
  return `is-name-font-${sanitizeMessageFont(fontId)}`;
}

export function displayNameStyleForUser(colorInput: string, fontId?: MessageFontId): { className: string; style: CSSProperties } {
  const color = sanitizeUserColor(colorInput);
  const style = {
    color,
    '--author-name-color': color,
  } as CSSProperties;
  return { className: `has-user-display ${displayNameFontClass(fontId)}`, style };
}

export function fontLabel(id?: MessageFontId) {
  return MESSAGE_FONT_OPTIONS.find((item) => item.id === sanitizeMessageFont(id))?.label ?? MESSAGE_FONT_OPTIONS[0].label;
}
