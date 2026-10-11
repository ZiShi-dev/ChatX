import { Children, cloneElement, isValidElement, useEffect, useRef, useState, type ReactNode, type ReactElement } from 'react';
import { IonIcon } from '@ionic/react';
import { chevronForwardOutline, ellipsisVertical } from 'ionicons/icons';
import { dismissOverlayHistory, registerOverlayClose, useOverlayHistory } from '../../lib/overlayBack';
import './MessageActionBar.css';

const PRIMARY = new Set(['رد', 'حفظ لي فقط', 'إلغاء الحفظ', 'نسخ', 'حذف']);
type Action = ReactElement<{ role?: string; children?: ReactNode; 'aria-label'?: string }>;
function label(action: Action) {
  const span = Children.toArray(action.props.children).find((child) => isValidElement(child) && child.type === 'span');
  return isValidElement<{ children: string }>(span) ? span.props.children : '';
}

export default function MessageActionBar({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useOverlayHistory(true, onClose);
  const close = () => {
    if (window.history.state?.chatxOverlay) dismissOverlayHistory();
    else closeRef.current();
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const navigation = root.current?.closest('.chat-navigation-slot')?.querySelector<HTMLElement>('ion-toolbar');
    if (navigation) navigation.inert = true;
    root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) closeRef.current();
    };
    const replaced = () => closeRef.current();
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('chatx-message-selection', replaced);
    const unregister = registerOverlayClose(replaced);
    return () => {
      if (navigation) navigation.inert = false;
      unregister();
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('chatx-message-selection', replaced);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  const items = Children.toArray(children);
  const actions = items.filter((item): item is Action => isValidElement<{ role?: string }>(item) && item.props.role === 'menuitem');
  const primary = actions.filter((item) => PRIMARY.has(label(item)));
  const secondary = actions.filter((item) => !PRIMARY.has(label(item)));
  return <div ref={root} className="message-selection" dir="rtl">
    <div className="message-selection-toolbar" role="toolbar" aria-label="إجراءات الرسالة المحددة">
      <button type="button" aria-label="إلغاء التحديد" onClick={close}><IonIcon icon={chevronForwardOutline} /></button>
      <strong aria-label="رسالة واحدة محددة">1</strong>
      {primary.map((item) => <div key={label(item)} className="message-selection-action" title={label(item)}>{cloneElement(item, { role: 'button', 'aria-label': label(item) })}</div>)}
      <button type="button" aria-label="المزيد من الإجراءات" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><IonIcon icon={ellipsisVertical} /></button>
    </div>
    {expanded && <div className="message-selection-more" role="menu" aria-label="المزيد من الإجراءات">{secondary}</div>}
    <div className="message-selection-reactions">{items.filter((item) => !actions.includes(item as Action))}</div>
  </div>;
}
