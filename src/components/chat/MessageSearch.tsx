import { useEffect, useRef } from 'react';
import SearchBar from '../common/SearchBar';

type MessageSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function MessageSearch({ value, onChange }: MessageSearchProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const focus = () => {
      const field = rootRef.current?.querySelector('ion-searchbar') as (HTMLElement & { setFocus?: () => Promise<void> }) | null;
      if (!field) return;
      if (field.setFocus) void field.setFocus();
      else (field.shadowRoot?.querySelector('input') ?? field.querySelector('input'))?.focus();
    };
    focus();
    const timer = window.setTimeout(focus, 60);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="message-search" ref={rootRef}>
      <SearchBar value={value} placeholder="ابحث في الرسائل" onChange={onChange} />
    </div>
  );
}
