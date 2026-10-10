import { useEffect, useState } from 'react';
import { IonContent, IonHeader, IonPage } from '@ionic/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import PageNav from '../components/common/PageNav';
import { adminFetch } from '../lib/adminApi';
import { useAuthStore } from '../stores/authStore';
import ProfilePage from './ProfilePage';
import SettingsPage from './SettingsPage';

type AccountTab = 'profile' | 'settings';

function tabFromQuery(value: string | null): AccountTab {
  return value === 'settings' ? 'settings' : 'profile';
}

export default function AccountPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = tabFromQuery(params.get('tab'));
  const loadAccount = useAuthStore((state) => state.loadAccount);
  const [notice, setNotice] = useState('');
  const [owner, setOwner] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadAccount().then((result) => {
      if (!alive) return;
      if (result === 'offline') setNotice('تعذر الاتصال.');
      else if (result === 'invalid') setNotice('تعذر تحميل الحساب.');
      else setNotice('');
    });
    return () => {
      alive = false;
    };
  }, [loadAccount]);

  useEffect(() => {
    let alive = true;
    void adminFetch('/api/owner/members').then(() => {
      if (alive) setOwner(true);
    }).catch(() => {
      if (alive) setOwner(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const select = (next: AccountTab) => {
    if (next === tab) return;
    setParams(next === 'profile' ? {} : { tab: next }, { replace: true });
  };

  const goHome = () => {
    navigate('/home');
    return true;
  };

  return (
    <IonPage>
      <IonHeader>
        <NetworkStatusBanner />
        <PageNav title="الحساب" fallback="/home" onBack={goHome} />
      </IonHeader>
      <IonContent className={tab === 'settings' ? 'settings-page account-scroll' : 'profile-page account-scroll'}>
        {tab === 'profile' && notice ? <p className="form-error account-notice">{notice}</p> : null}
        {tab === 'profile' && <ProfilePage embedded onShowSettings={() => select('settings')} />}
        {tab === 'settings' && <SettingsPage embedded />}
        <div className="account-end" aria-hidden="true" />
      </IonContent>
      <div className={`group-tabs account-tabs ${owner ? 'is-three' : 'is-two'}`} role="tablist" aria-label="الحساب">
        <button type="button" role="tab" aria-selected={tab === 'profile'} className={tab === 'profile' ? 'is-on' : undefined} onClick={() => select('profile')}>
          الملف الشخصي
        </button>
        <button type="button" role="tab" aria-selected={tab === 'settings'} className={tab === 'settings' ? 'is-on' : undefined} onClick={() => select('settings')}>
          الإعدادات
        </button>
        {owner ? (
          <button type="button" onClick={() => navigate('/admin')}>
            الإدارة
          </button>
        ) : null}
      </div>
    </IonPage>
  );
}
