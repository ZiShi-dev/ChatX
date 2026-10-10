import { installOfflineShell } from './lib/offlineShell';
import { lazy, Suspense, useEffect, type ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import AppErrorBoundary from './components/common/AppErrorBoundary';
import StartupScreen from './components/common/StartupScreen';
import KeyGate from './components/common/KeyGate';
import { NotificationPermissionDialog } from './components/common/NotificationPermission';
import PageSkeleton, { type SkeletonKind } from './components/common/PageSkeleton';
import ActivationPage from './pages/ActivationPage';
import ChatPage from './pages/ChatPage';
import HomePage from './pages/HomePage';

const GroupMembersPage = lazy(() => import('./pages/GroupMembersPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const DirectMediaPage = lazy(() => import('./pages/DirectMediaPage'));
const GroupProfilePage = lazy(() => import('./pages/GroupProfilePage'));
const NewChatPage = lazy(() => import('./pages/NewChatPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const SavedPage = lazy(() => import('./pages/SavedPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const PeopleAdminPage = lazy(() => import('./pages/PeopleAdminPage'));
import { useInboxAlerts } from './hooks/useInboxAlerts';
import { closeTopOverlay } from './lib/overlayBack';
import LiveInboxBanner from './components/common/LiveInboxBanner';
import { usePresenceSync } from './hooks/usePresenceSync';
import { InboxWatch } from './lib/inboxWatch';
import { listenForChatNotificationOpens } from './lib/notifications';
import { useAuthStore } from './stores/authStore';
import { observeNetwork } from './stores/networkStore';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';
import './theme/variables.css';
import './theme/name-fonts.css';
import './theme/chat.css';

setupIonicReact({ mode: 'md' });

function NativeChrome() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
    void StatusBar.setBackgroundColor({ color: '#121a18' }).catch(() => undefined);
    const opened = listenForChatNotificationOpens((conversationId) => navigate(`/chat/${conversationId}`));
    const inboxOpen = Capacitor.isNativePlatform()
      ? InboxWatch.addListener('open', (event) => {
          if (!event.conversationId) return;
          navigate(event.messageId ? `/chat/${event.conversationId}?at=${event.messageId}` : `/chat/${event.conversationId}`);
        })
      : Promise.resolve({ remove: async () => undefined });
    const leaveScreen = () => {
      const path = window.location.pathname;
      if (path === '/home' || path === '/activation') {
        void CapApp.exitApp();
        return;
      }
      navigate(-1);
    };
    const onHardwareBack = () => {
      if (closeTopOverlay()) return;
      leaveScreen();
    };
    const listener = CapApp.addListener('backButton', onHardwareBack);
    const onIonBack = (event: Event) => {
      (event as CustomEvent<{ register: (priority: number, handler: (next: () => void) => void) => void }>).detail.register(10, (next) => {
        if (closeTopOverlay()) return;
        const path = window.location.pathname;
        if (path === '/home' || path === '/activation') {
          void CapApp.exitApp();
          return;
        }
        next();
      });
    };
    document.addEventListener('ionBackButton', onIonBack);
    return () => {
      void opened.then((stop) => stop());
      void inboxOpen.then((handle) => handle.remove());
      void listener.then((handle) => handle.remove());
      document.removeEventListener('ionBackButton', onIonBack);
    };
  }, [navigate]);

  return null;
}

function AppRoutes() {
  const activated = useAuthStore((state) => state.activated);
  useEffect(observeNetwork, []);
  useEffect(installOfflineShell, []);
  usePresenceSync();
  useInboxAlerts();
  const guard = (element: ReactElement) => (activated ? element : <Navigate to="/activation" replace />);
  const page = (element: ReactElement, kind: SkeletonKind) => <Suspense fallback={<PageSkeleton kind={kind} />}>{guard(element)}</Suspense>;

  return (
    <BrowserRouter>
      <NativeChrome />
      <LiveInboxBanner />
      <NotificationPermissionDialog />
      <KeyGate>
        <IonRouterOutlet>
        <Routes>
        <Route path="/activation" element={activated ? <Navigate to="/home" replace /> : <ActivationPage />} />
        <Route path="/home" element={guard(<HomePage />)} />
        <Route path="/chat/:id/media" element={page(<DirectMediaPage />, 'media')} />
        <Route path="/chat/:id" element={guard(<ChatPage />)} />
        <Route path="/new" element={page(<NewChatPage />, 'people')} />
        <Route path="/group/:id/members" element={page(<GroupMembersPage />, 'members')} />
        <Route path="/group/:id" element={page(<GroupProfilePage />, 'group')} />
        <Route path="/notifications" element={page(<NotificationsPage />, 'notices')} />
        <Route path="/saved" element={page(<SavedPage />, 'saved')} />
        <Route path="/account" element={page(<AccountPage />, 'account')} />
        <Route path="/profile" element={page(<ProfilePage />, 'profile')} />
        <Route path="/settings" element={page(<SettingsPage />, 'settings')} />
        <Route path="/admin" element={page(<PeopleAdminPage />, 'people')} />
        <Route path="/" element={<Navigate to={activated ? '/home' : '/activation'} replace />} />
        <Route path="*" element={<Navigate to={activated ? '/home' : '/activation'} replace />} />
        </Routes>
        </IonRouterOutlet>
      </KeyGate>
    </BrowserRouter>
  );
}

const App: React.FC = () => (
  <AppErrorBoundary>
    <IonApp>
      <div className="app-wallpaper" aria-hidden="true" />
      <StartupScreen><AppRoutes /></StartupScreen>
    </IonApp>
  </AppErrorBoundary>
);

export default App;
