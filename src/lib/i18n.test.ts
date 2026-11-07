import { useSettingsStore } from '../stores/settingsStore';
import { translate } from './i18n';

afterEach(() => useSettingsStore.getState().setLocale('ar'));

describe('translate', () => {
  it('keeps Arabic as the starting language and offers French and English', () => {
    expect(translate('ar', 'home.all')).toBe('الكل');
    expect(translate('fr', 'home.all')).toBe('Tout');
    expect(translate('en', 'home.all')).toBe('All');
    expect(translate('fr', 'home.notificationsUnread', { count: 3 })).toBe('Notifications, 3 non lues');
  });

  it('sets the page direction from the chosen language', () => {
    useSettingsStore.getState().setLocale('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    useSettingsStore.getState().setLocale('ar');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
  });
});
