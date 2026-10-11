import type { CSSProperties } from 'react';
import { sanitizeUserColor } from './userStyle';

export const CUSTOM_ROLE_COLORS_MAX = 4;
export const CUSTOM_ROLE_LABEL_MAX = 32;

export function parseCustomRoleColors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const colors: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return [];
    const hex = sanitizeUserColor(item, '');
    if (!hex || hex === '') return [];
    if (!colors.includes(hex)) colors.push(hex);
    if (colors.length >= CUSTOM_ROLE_COLORS_MAX) break;
  }
  return colors;
}

export function sanitizeCustomRoleLabel(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, CUSTOM_ROLE_LABEL_MAX);
}

export function customRoleReady(user: { customRoleLabel?: string; customRoleColors?: string[] }) {
  const label = sanitizeCustomRoleLabel(user.customRoleLabel ?? '');
  const colors = parseCustomRoleColors(user.customRoleColors);
  return label.length > 0 && colors.length > 0 ? { label, colors } : null;
}

export function customRoleGradient(colors: string[]): CSSProperties {
  if (colors.length === 1) return { background: colors[0] };
  return { background: `linear-gradient(90deg, ${colors.join(', ')})` };
}
