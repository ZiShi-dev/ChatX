import { useEffect, useRef, type ReactNode } from 'react';
import { IonIcon, IonToolbar } from '@ionic/react';
import { chevronForwardOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';

type PageNavProps = {
  title: ReactNode;
  fallback: string;
  action?: ReactNode;
  sub?: boolean;
  quiet?: boolean;
  onBack?: () => boolean;
};

export default function PageNav({ title, fallback, action, sub = false, quiet = false, onBack }: PageNavProps) {
  const navigate = useNavigate();
  const backRef = useRef<HTMLButtonElement>(null);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    const goBack = (event: Event) => {
      const button = backRef.current;
      if (!button || !event.composedPath().includes(button)) return;
      if (onBackRef.current?.()) return;
      const index = window.history.state?.idx;
      if (index === 0) navigate(fallback);
      else navigate(-1);
    };
    window.addEventListener('click', goBack, true);
    return () => window.removeEventListener('click', goBack, true);
  }, [navigate, fallback]);

  return (
    <IonToolbar className={quiet ? 'page-toolbar chat-bar' : sub ? 'page-toolbar sub' : 'page-toolbar'}>
      <div className="home-nav">
        <div className="page-nav-title">
          {!sub && (
            <button ref={backRef} type="button" className="home-nav-menu" aria-label="رجوع">
              <IonIcon icon={chevronForwardOutline} />
            </button>
          )}
          {typeof title === 'string' ? <strong>{title}</strong> : title}
        </div>
        {action}
      </div>
    </IonToolbar>
  );
}
