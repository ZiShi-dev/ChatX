import { useEffect, useState, type ReactNode } from 'react';
import { brandName, DEFAULT_LOGO } from '../../lib/appearance';
import { useSettingsStore } from '../../stores/settingsStore';
import './StartupScreen.css';

export default function StartupScreen({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true);
  const title = useSettingsStore((state) => state.appearance.name);
  const logo = useSettingsStore((state) => state.appearance.logo);
  const name = brandName(title);

  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setVisible(false), reducedMotion ? 120 : 1100);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <div className="startup-content" inert={visible}>{children}</div>
      {visible && (
        <div className="startup-screen" role="status" aria-label={name}>
          <div className="startup-brand">
            <img className="startup-logo" src={logo || DEFAULT_LOGO} alt="" width="128" height="128" decoding="async" />
            <span className="startup-name" dir="auto">{name}</span>
          </div>
        </div>
      )}
    </>
  );
}
