import { useNavigate } from 'react-router-dom';

export type AccountTabId = 'profile' | 'settings' | 'admin';

type AccountTabsProps = {
  active: AccountTabId;
  owner: boolean;
};

export default function AccountTabs({ active, owner }: AccountTabsProps) {
  const navigate = useNavigate();
  return (
    <div className={`group-tabs account-tabs ${owner ? 'is-three' : 'is-two'}`} role="tablist" aria-label="الحساب">
      <button
        type="button"
        role="tab"
        aria-selected={active === 'profile'}
        className={active === 'profile' ? 'is-on' : undefined}
        onClick={() => active !== 'profile' && navigate('/account', { replace: true })}
      >
        الملف الشخصي
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === 'settings'}
        className={active === 'settings' ? 'is-on' : undefined}
        onClick={() => active !== 'settings' && navigate('/account?tab=settings', { replace: true })}
      >
        الإعدادات
      </button>
      {owner ? (
        <button
          type="button"
          role="tab"
          aria-selected={active === 'admin'}
          className={active === 'admin' ? 'is-on' : undefined}
          onClick={() => active !== 'admin' && navigate('/admin', { replace: true })}
        >
          الإدارة
        </button>
      ) : null}
    </div>
  );
}
