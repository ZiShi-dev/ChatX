import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EMOJI_GROUPS } from '../../lib/emojiCatalog';
import { recentEmoji, rememberEmoji, searchEmoji } from '../../lib/emojiPicker';
import { useAuthStore } from '../../stores/authStore';
import EmojiText from '../common/EmojiText';
import './EmojiPanel.css';

type EmojiPanelProps = {
  selected?: string;
  onPick: (emoji: string) => void;
  onClose?: () => void;
};

const EmojiOption = memo(function EmojiOption({ emoji, selected, active, onPick }: { emoji: string; selected: boolean; active: boolean; onPick: (emoji: string) => void }) {
  return <button type="button" role="option" aria-selected={selected} aria-label={emoji} tabIndex={active ? 0 : -1} className={selected ? 'is-on' : undefined} onClick={() => onPick(emoji)}><EmojiText text={emoji} /></button>;
});

export default function EmojiPanel({ selected, onPick, onClose }: EmojiPanelProps) {
  const owner = useAuthStore(state => state.currentUser.id);
  const [recent, setRecent] = useState(() => recentEmoji(owner));
  const [groupId, setGroupId] = useState(recent.length ? 'recent' : EMOJI_GROUPS[0].id);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [limit, setLimit] = useState(120);
  const grid = useRef<HTMLDivElement>(null);
  const scroll = useRef(new Map<string, number>());
  const pickRef = useRef(onPick);
  const accountRef = useRef(owner);
  useEffect(() => { pickRef.current = onPick; }, [onPick]);
  useEffect(() => {
    if (accountRef.current === owner) return;
    accountRef.current = owner; const next = recentEmoji(owner);
    setRecent(next); setQuery(''); setGroupId(next.length ? 'recent' : 'faces'); scroll.current.clear();
  }, [owner]);
  const pick = useCallback((emoji: string) => { pickRef.current(emoji); rememberEmoji(owner, emoji); }, [owner]);
  const id = useId();
  const groups = useMemo(() => [{ id: 'recent', label: 'الأخيرة', emojis: recent }, ...EMOJI_GROUPS], [recent]);
  const group = groups.find(item => item.id === groupId) ?? groups[1];
  const searching = Boolean(query.trim());
  const matches = useMemo(() => searching ? searchEmoji(query) : [...new Set(group.emojis)], [searching, query, group]);
  const items = useMemo(() => searching ? matches.slice(0, limit) : matches, [searching, matches, limit]);
  const scrollKey = searching ? `search:${query}` : group.id;
  useLayoutEffect(() => { if (grid.current) grid.current.scrollTop = scroll.current.get(scrollKey) ?? 0; setActive(0); setLimit(120); }, [scrollKey]);

  return (
    <div className="emoji-panel emoji-picker" onPointerDown={event => event.stopPropagation()} onPointerMove={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} onKeyDown={event => {
      if (event.key !== 'Escape') return;
      if (query) { event.stopPropagation(); setQuery(''); }
      else if (onClose) { event.stopPropagation(); onClose(); }
    }}>
      <div className="emoji-picker-heading"><strong>{searching ? 'نتائج البحث' : group.label}</strong><span>{matches.length}</span>{onClose && <button type="button" aria-label="إغلاق الإيموجي" onClick={onClose}>×</button>}</div>
      <div className="emoji-picker-search"><input type="search" dir="auto" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث عن إيموجي أو فئة" aria-label="البحث عن إيموجي" autoComplete="off" />{query && <button type="button" aria-label="مسح البحث" onClick={() => setQuery('')}>×</button>}</div>
      <div className="emoji-tabs" role="tablist" aria-label="أنواع الإيموجي" onKeyDown={event => {
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement); if (current < 0) return;
        const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
        const step = event.key === 'ArrowRight' ? (rtl ? -1 : 1) : event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : step ? (current + step + buttons.length) % buttons.length : -1;
        if (next < 0) return;
        event.preventDefault(); setGroupId(groups[next].id); setQuery(''); buttons[next].focus();
      }}>
        {groups.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === group.id}
            aria-label={item.label}
            title={item.label}
            aria-controls={`${id}-grid`}
            tabIndex={item.id === group.id ? 0 : -1}
            className={item.id === group.id ? 'is-on' : undefined}
            onClick={event => { setQuery(''); setGroupId(item.id); event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }}
          >
            {item.id === 'recent' ? <span aria-hidden="true">◷</span> : <EmojiText text={item.emojis[0]} />}
          </button>
        ))}
      </div>
      <div ref={grid} id={`${id}-grid`} className="emoji-grid" role="listbox" aria-label={searching ? 'نتائج البحث' : group.label} onScroll={event => { if (!searching) scroll.current.set(scrollKey, event.currentTarget.scrollTop); }} onFocus={event => {
        const button = event.target.closest('button');
        const index = button ? [...event.currentTarget.querySelectorAll('button')].indexOf(button) : -1; if (index >= 0) setActive(index);
      }} onKeyDown={event => {
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement); if (current < 0) return;
        const columns = getComputedStyle(event.currentTarget).gridTemplateColumns.split(' ').length;
        const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
        const step = event.key === 'ArrowDown' ? columns : event.key === 'ArrowUp' ? -columns : event.key === 'ArrowRight' ? (rtl ? -1 : 1) : event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : step ? Math.max(0, Math.min(buttons.length - 1, current + step)) : -1;
        if (next >= 0) { event.preventDefault(); buttons[next]?.focus(); }
      }}>
        {items.map((emoji, index) => <EmojiOption key={emoji} emoji={emoji} selected={emoji === selected} active={index === active} onPick={pick} />)}
        {!items.length && <p className="emoji-picker-empty" role="status">{searching ? 'لا توجد نتائج. جرّب اسم فئة أو إيموجي.' : 'الإيموجي الذي تستخدمه سيظهر هنا.'}</p>}
      </div>
      {items.length < matches.length && <button type="button" className="emoji-picker-more" onClick={() => setLimit(value => value + 120)}>عرض المزيد</button>}
    </div>
  );
}
