import { useEffect, useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { constrainedDevice } from '../lib/deviceBudget';

export function useProfileMotion() {
  const saver = useSettingsStore(state => state.dataSaver);
  const [visible, setVisible] = useState(document.visibilityState !== 'hidden');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible && !saver && !constrainedDevice();
}
