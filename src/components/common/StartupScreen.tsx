import { useEffect, useState, type ReactNode } from 'react';
import './StartupScreen.css';

export default function StartupScreen({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setVisible(false), reducedMotion ? 120 : 1100);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <div className="startup-content" inert={visible}>{children}</div>
      {visible && (
        <div className="startup-screen" role="status" aria-label="ChatX">
          <div className="startup-brand">
            <img className="startup-logo" src="/assets/icon/icon.png" alt="" width="128" height="128" decoding="async" />
            <span className="startup-name" dir="ltr">ChatX</span>
          </div>
        </div>
      )}
    </>
  );
}
