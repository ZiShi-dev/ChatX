import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLiveInbox, watchingRoom } from '../../lib/liveInbox';
import EmojiText from './EmojiText';
import './LiveInboxBanner.css';
export default function LiveInboxBanner() {
  const notices = useLiveInbox(state => state.notices);
  const dismiss = useLiveInbox(state => state.dismiss);
  const notice = notices[notices.length - 1];
  const location = useLocation(); const navigate = useNavigate();
  useEffect(() => {
    if (!notice) return;
    if (watchingRoom(location.pathname, notice.conversationId)) { dismiss(notice.key); return; }
    const timer = window.setTimeout(() => dismiss(notice.key), 6500);
    return () => window.clearTimeout(timer);
  }, [notice, dismiss, location.pathname]);
  if (!notice) return null;
  return <aside className="live-inbox-banner" aria-label="رسالة جديدة" dir="rtl">
    <button className="live-inbox-open" type="button" onClick={() => { dismiss(notice.key); navigate(`/chat/${notice.conversationId}?at=${encodeURIComponent(notice.messageId)}`); }}>
      <span role="status"><strong>{notice.title}</strong><span><EmojiText text={notice.body} /></span></span>
    </button>
    <button className="live-inbox-close" type="button" aria-label="إخفاء الإشعار" onClick={() => dismiss(notice.key)}>×</button>
  </aside>;
}
