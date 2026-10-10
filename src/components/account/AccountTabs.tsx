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
        onClick={() => navigate('/account')}
      >
        الملف الشخصي
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === 'settings'}
        className={active === 'settings' ? 'is-on' : undefined}
        onClick={() => navigate('/account?tab=settings')}
      >
        الإعدادات
      </button>
      {owner ? (
        <button
          type="button"
          role="tab"
          aria-selected={active === 'admin'}
          className={active === 'admin' ? 'is-on' : undefined}
          onClick={() => navigate('/admin')}
        >
          الإدارة
        </button>
      ) : null}
    </div>
  );
}
