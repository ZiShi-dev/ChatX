import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../lib/i18n';

export type AccountTabId = 'profile' | 'settings' | 'admin';

type AccountTabsProps = {
  active: AccountTabId;
  owner: boolean;
};

export default function AccountTabs({ active, owner }: AccountTabsProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <div className={`group-tabs account-tabs ${owner ? 'is-three' : 'is-two'}`} role="tablist" aria-label={t('account.title')}>
      <button
        type="button"
        role="tab"
        aria-selected={active === 'profile'}
        className={active === 'profile' ? 'is-on' : undefined}
        onClick={() => active !== 'profile' && navigate('/account', { replace: true })}
      >
        {t('account.profile')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === 'settings'}
        className={active === 'settings' ? 'is-on' : undefined}
        onClick={() => active !== 'settings' && navigate('/account?tab=settings', { replace: true })}
      >
        {t('account.settings')}
      </button>
      {owner ? (
        <button
          type="button"
          role="tab"
          aria-selected={active === 'admin'}
          className={active === 'admin' ? 'is-on' : undefined}
          onClick={() => active !== 'admin' && navigate('/admin', { replace: true })}
        >
          {t('account.admin')}
        </button>
      ) : null}
    </div>
  );
}
