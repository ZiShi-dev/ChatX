import { useSettingsStore } from '../stores/settingsStore';
import { translate, type Locale } from './i18n';

let typingLocale: Locale = useSettingsStore.getState().locale;
useSettingsStore.subscribe((state) => {
  typingLocale = state.locale;
});

export function typingLabel(names: string[]) {
  if (names.length === 0) return '';
  const locale = typingLocale;
  if (names.length === 1) return translate(locale, 'typing.one', { name: names[0] });
  if (names.length === 2) return translate(locale, 'typing.two', { a: names[0], b: names[1] });
  return translate(locale, 'typing.many', { count: names.length });
}
