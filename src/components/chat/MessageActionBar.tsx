import { Children, cloneElement, isValidElement, useEffect, useRef, useState, type ReactNode, type ReactElement } from 'react';
import { IonIcon } from '@ionic/react';
import { chevronForwardOutline, ellipsisVertical } from 'ionicons/icons';
import { chatNavigationSlot } from '../../lib/messageActionsHost';
import { dismissOverlayHistory, registerOverlayClose, useOverlayHistory } from '../../lib/overlayBack';
import './MessageActionBar.css';

const PRIMARY_ORDER = ['رد', 'تعديل', 'نسخ', 'حذف'] as const;
const PRIMARY = new Set<string>(PRIMARY_ORDER);
function primaryRank(label: string) {
  const index = PRIMARY_ORDER.indexOf(label as typeof PRIMARY_ORDER[number]);
  return index === -1 ? 99 : index;
}
type Action = ReactElement<{ role?: string; children?: ReactNode; 'aria-label'?: string }>;
function label(action: Action) {
  const span = Children.toArray(action.props.children).find((child) => isValidElement(child) && child.type === 'span');
  return isValidElement<{ children: string }>(span) ? span.props.children : '';
}

export default function MessageActionBar({ children, onClose, fallback = false }: { children: ReactNode; onClose: () => void; fallback?: boolean }) {
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
    const slot = root.current?.closest('.chat-navigation-slot') ?? chatNavigationSlot(root.current);
    slot?.classList.add('has-message-selection');
    const navigation = slot?.querySelector<HTMLElement>('ion-toolbar');
    if (navigation) navigation.inert = true;
    root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
    };
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || root.current?.contains(target)) return;
      if (target instanceof Element && (target.closest('.bubble-stack.is-picked') || target.closest('.message-reaction-float') || target.closest('.reaction-keyboard'))) return;
      closeRef.current();
    };
    const replaced = () => closeRef.current();
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('chatx-message-selection', replaced);
    const unregister = registerOverlayClose(replaced);
    return () => {
      slot?.classList.remove('has-message-selection');
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
  const primary = actions.filter((item) => PRIMARY.has(label(item))).sort((a, b) => primaryRank(label(a)) - primaryRank(label(b)));
  const secondary = actions.filter((item) => !PRIMARY.has(label(item)));
  return <div ref={root} className={fallback ? 'message-selection message-selection-fallback' : 'message-selection'} dir="rtl">
    <div className="message-selection-toolbar" role="toolbar" aria-label="إجراءات الرسالة المحددة">
      <button type="button" aria-label="إلغاء التحديد" onClick={close}><IonIcon icon={chevronForwardOutline} /></button>
      <strong aria-label="رسالة واحدة محددة">1</strong>
      {primary.map((item) => <div key={label(item)} className="message-selection-action" title={label(item)}>{cloneElement(item, { role: 'button', 'aria-label': label(item) })}</div>)}
      {secondary.length > 0 && (
        <button type="button" aria-label="المزيد من الإجراءات" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><IonIcon icon={ellipsisVertical} /></button>
      )}
    </div>
    {expanded && secondary.length > 0 && <div className="message-selection-more" role="menu" aria-label="المزيد من الإجراءات">{secondary}</div>}
  </div>;
}
