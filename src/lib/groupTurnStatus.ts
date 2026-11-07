import type { Locale } from './locale';
import { dateLocale, translate, type MessageKey } from './i18n';

export type TurnRefresh = 'loading' | 'ok' | 'offline' | 'invalid' | 'local';

const turnFormatOptions: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  numberingSystem: 'latn',
};

export function groupTurnStatus(
  locale: Locale,
  name: string,
  mine: boolean,
  now: number,
  opensAt: string | undefined,
  refresh: TurnRefresh,
) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
  const opens = opensAt ? Date.parse(opensAt) : Number.NaN;
  const expires = opens + 7 * 24 * 60 * 60 * 1000;
  const dl = dateLocale(locale);
  const format = (date: number) => new Intl.DateTimeFormat(dl, turnFormatOptions).format(date);

  if (Number.isFinite(expires) && now >= expires) {
    if (refresh === 'loading') return t('turn.expired.loading');
    if (refresh === 'offline') return t('turn.expired.offline');
    if (refresh === 'ok') return t('turn.expired.noServerData');
    return t('turn.expired.loadFailed');
  }
  if (Number.isFinite(opens) && opens > now) {
    return mine ? t('turn.scheduledMine', { when: format(opens) }) : t('turn.scheduledTheirs', { name, when: format(opens) });
  }
  if (mine) {
    return Number.isFinite(expires)
      ? t('turn.activeMineUntil', { when: format(expires) })
      : t('turn.activeMineOpen');
  }
  return Number.isFinite(expires)
    ? t('turn.activeTheirsUntil', { name, when: format(expires) })
    : t('turn.activeTheirsOpen', { name });
}
