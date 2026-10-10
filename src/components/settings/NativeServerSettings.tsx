import { useState } from 'react';
import { getApiOrigin, isValidApiOrigin, readStoredApiOrigin, saveApiOrigin } from '../../lib/apiOrigin';
import { resetNetworkMeasurements, useNetworkStore } from '../../stores/networkStore';
import { useChatStore } from '../../stores/chatStore';

export default function NativeServerSettings() {
  const current = getApiOrigin();
  const [value, setValue] = useState(readStoredApiOrigin() || current);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const apply = () => {
    setError('');
    setSaved('');
    try {
      saveApiOrigin(value);
      resetNetworkMeasurements();
      useNetworkStore.getState().setNetwork(navigator.onLine === false ? 'offline' : 'online');
      useChatStore.getState().flushOutgoing();
      setSaved('تم الحفظ. جارٍ إعادة الاتصال…');
      window.setTimeout(() => setSaved(''), 4000);
    } catch {
      setError('استخدم عنوانًا يبدأ بـ https:// مع اسم نطاق أو IP.');
    }
  };

  return (
    <section className="settings-block">
      <h2>الخادم</h2>
      <p className="settings-lead">مطلوب على تطبيق أندرويد. مثال: https://10.145.239.228:8443 — نفس الشهادة المثبتة على الهاتف.</p>
      <article className="setting-card column">
        <label className="group-name">
          <span>عنوان HTTPS</span>
          <input
            dir="ltr"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
            placeholder="https://"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        {current && isValidApiOrigin(current) ? <p className="settings-muted" dir="ltr">الحالي: {current}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        {saved ? <p className="settings-ok">{saved}</p> : null}
        <button type="button" className="settings-save" onClick={apply}>حفظ عنوان الخادم</button>
      </article>
    </section>
  );
}
