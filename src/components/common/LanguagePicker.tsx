import { LOCALES, type Locale } from '../../lib/locale';
import { useI18n } from '../../lib/i18n';

const NATIVE: Record<Locale, string> = {
  ar: 'العربية',
  fr: 'Français',
  en: 'English',
};

export default function LanguagePicker() {
  const { locale, setLocale, t } = useI18n();
  return (
    <section className="settings-block language-block">
      <h2>{t('language.title')}</h2>
      <p className="settings-lead">{t('language.lead')}</p>
      <div className="setting-choices language-choices" role="radiogroup" aria-label={t('language.title')}>
        {LOCALES.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            lang={id}
            aria-checked={locale === id}
            className={locale === id ? 'is-on' : undefined}
            onClick={() => setLocale(id)}
          >
            {NATIVE[id]}
          </button>
        ))}
      </div>
    </section>
  );
}
