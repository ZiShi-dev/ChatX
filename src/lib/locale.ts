export type Locale = 'ar' | 'fr' | 'en';

export const LOCALES: readonly Locale[] = ['ar', 'fr', 'en'];

export function isLocale(value: unknown): value is Locale {
  return value === 'ar' || value === 'fr' || value === 'en';
}

export function localeDir(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

export function applyLocale(locale: Locale) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.documentElement.dir = localeDir(locale);
}
