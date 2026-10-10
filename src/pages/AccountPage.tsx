import { useEffect, useMemo, useRef, useState } from 'react';
import { IonContent, IonHeader, IonPage } from '@ionic/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import PageNav from '../components/common/PageNav';
import { adminFetch } from '../lib/adminApi';
import { useAuthStore } from '../stores/authStore';
import AccountTabs from '../components/account/AccountTabs';
import { createScrollHold } from '../lib/ionScrollHold';
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
  const contentRef = useRef<HTMLIonContentElement>(null);
  const scrollHold = useMemo(() => createScrollHold(contentRef), []);

  useEffect(() => {
    let alive = true;
    void loadAccount().then((result) => {
      if (!alive) return;
      if (result === 'no_server') setNotice('اضبط عنوان الخادم من الإعدادات → الخادم.');
      else if (result === 'offline') setNotice('تعذر الاتصال.');
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
      <IonContent ref={contentRef} className={tab === 'settings' ? 'settings-page account-scroll' : 'profile-page account-scroll'}>
        {tab === 'profile' && notice ? <p className="form-error account-notice">{notice}</p> : null}
        {tab === 'profile' && <ProfilePage embedded scrollHold={scrollHold} onShowSettings={() => select('settings')} />}
        {tab === 'settings' && <SettingsPage embedded />}
        <div className="account-end" aria-hidden="true" />
      </IonContent>
      <AccountTabs active={tab} owner={owner} />
    </IonPage>
  );
}
