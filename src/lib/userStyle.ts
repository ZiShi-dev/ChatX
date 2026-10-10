import type { CSSProperties } from 'react';
import type { MessageFontId } from '../types/user';

export const USER_COLOR_OPTIONS = [
  '#3d9b84',
  '#4d7ea8',
  '#6f8f72',
  '#5f8f8a',
  '#a56b7a',
  '#c4893a',
  '#7d6b9a',
  '#b08968',
] as const;

export const MESSAGE_FONT_OPTIONS: Array<{ id: MessageFontId; label: string; family: string }> = [
  { id: 'system', label: 'افتراضي', family: 'inherit' },
  { id: 'clear', label: 'واضح', family: 'Tahoma, "Segoe UI", sans-serif' },
  { id: 'rounded', label: 'ناعم', family: '"Segoe UI", Tahoma, sans-serif' },
  { id: 'classic', label: 'كلاسيكي', family: 'Georgia, "Times New Roman", serif' },
];

const FONT_IDS = new Set(MESSAGE_FONT_OPTIONS.map((item) => item.id));

export function sanitizeUserColor(value: unknown, fallback: string = USER_COLOR_OPTIONS[0]) {
  if (typeof value !== 'string') return fallback;
  const hex = value.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(hex)) return fallback;
  return (USER_COLOR_OPTIONS as readonly string[]).includes(hex) ? hex : fallback;
}

export function sanitizeMessageFont(value: unknown): MessageFontId {
  return typeof value === 'string' && FONT_IDS.has(value as MessageFontId) ? value as MessageFontId : 'system';
}

export function messageFontFamily(id?: MessageFontId) {
  const font = MESSAGE_FONT_OPTIONS.find((item) => item.id === (id ?? 'system'));
  return font && font.id !== 'system' ? font.family : undefined;
}

function channel(color: string, index: number) {
  return Number.parseInt(color.slice(1 + index * 2, 3 + index * 2), 16);
}

function inkOn(color: string) {
  const shade = (value: number) => {
    const unit = value / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * shade(channel(color, 0)) + 0.7152 * shade(channel(color, 1)) + 0.0722 * shade(channel(color, 2));
  return lum > 0.42 ? '#14201c' : '#f4fbf8';
}

export function bubbleStyleForUser(colorInput: string, mine: boolean, fontId?: MessageFontId): { className: string; style: CSSProperties } {
  const color = sanitizeUserColor(colorInput);
  const font = messageFontFamily(fontId);
  const background = mine
    ? `color-mix(in srgb, ${color} 58%, var(--chatx-bg))`
    : `color-mix(in srgb, ${color} 20%, var(--chatx-surface))`;
  const style = {
    '--bubble-accent': color,
    '--bubble-bg': background,
    background,
    borderColor: color,
    ...(mine ? { color: inkOn(color), '--chatx-text': inkOn(color), '--chatx-muted': `color-mix(in srgb, ${inkOn(color)} 72%, transparent)` } : {}),
    ...(font ? { fontFamily: font } : {}),
  } as CSSProperties;
  return { className: 'has-user-style', style };
}

export function fontLabel(id?: MessageFontId) {
  return MESSAGE_FONT_OPTIONS.find((item) => item.id === sanitizeMessageFont(id))?.label ?? MESSAGE_FONT_OPTIONS[0].label;
}
