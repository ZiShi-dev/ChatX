import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IonContent, IonHeader, IonPage } from '@ionic/react';
import { useSearchParams } from 'react-router-dom';
import NetworkStatusBanner from '../components/common/NetworkBanner';
import PageNav from '../components/common/PageNav';
import { adminFetch } from '../lib/adminApi';
import { useAuthStore } from '../stores/authStore';
import AccountTabs from '../components/account/AccountTabs';
import { createScrollHold } from '../lib/ionScrollHold';
import ProfilePage from './ProfilePage';
import SettingsPage from './SettingsPage';
import { useI18n } from '../lib/i18n';

type AccountTab = 'profile' | 'settings';

function tabFromQuery(value: string | null): AccountTab {
  return value === 'settings' ? 'settings' : 'profile';
}

export default function AccountPage() {
  const { t } = useI18n();
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
      if (result === 'no_server' || result === 'offline') setNotice('');
      else if (result === 'invalid') setNotice(t('account.loadInvalid'));
      else setNotice('');
    });
    return () => {
      alive = false;
    };
  }, [loadAccount, t]);

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

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    let alive = true;
    const apply = () => {
      if (!alive) return;
      const inner = content.shadowRoot?.querySelector('.inner-scroll');
      if (inner instanceof HTMLElement) inner.scrollTop = 0;
      void content.getScrollElement().then((scroller) => {
        if (alive) scroller.scrollTop = 0;
      });
    };
    apply();
    const frame = window.requestAnimationFrame(apply);
    return () => {
      alive = false;
      window.cancelAnimationFrame(frame);
    };
  }, [tab]);

  return (
    <IonPage>
      <IonHeader>
        <NetworkStatusBanner />
        <PageNav title={t('account.title')} fallback="/home" />
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
