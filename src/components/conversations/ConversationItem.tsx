import { useRef } from 'react';
import { IonIcon } from '@ionic/react';
import { banOutline, notificationsOffOutline } from 'ionicons/icons';
import Avatar from '../common/Avatar';
import EmojiText from '../common/EmojiText';
import type { ConversationType } from '../../types/conversation';

type ConversationItemProps = {
  title: string;
  color: string;
  preview: string;
  deleted?: boolean;
  time?: string;
  unread: number;
  type: ConversationType;
  photo?: string;
  muted?: string;
  detail?: string;
  onClick: () => void;
  onHold: () => void;
};

export default function ConversationItem({
  title,
  color,
  preview,
  deleted = false,
  time,
  unread,
  type,
  photo,
  muted,
  detail,
  onClick,
  onHold,
}: ConversationItemProps) {
  const holdTimer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const armed = useRef(false);
  const start = useRef({ x: 0, y: 0 });

  const clearHold = () => window.clearTimeout(holdTimer.current);

  return (
    <button
      type="button"
      className={unread > 0 ? 'conversation-row has-unread' : 'conversation-row'}
      onContextMenu={(event) => {
        event.preventDefault();
        onHold();
      }}
      onPointerDown={(event) => {
        held.current = false;
        armed.current = false;
        start.current = { x: event.clientX, y: event.clientY };
        holdTimer.current = window.setTimeout(() => {
          armed.current = true;
        }, 480);
      }}
      onPointerMove={(event) => {
        if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 12) {
          clearHold();
          armed.current = false;
        }
      }}
      onPointerUp={() => {
        clearHold();
        if (!armed.current) return;
        held.current = true;
        armed.current = false;
        onHold();
      }}
      onPointerCancel={clearHold}
      onPointerLeave={clearHold}
      onClick={() => {
        if (held.current) {
          held.current = false;
          return;
        }
        onClick();
      }}
    >
      <Avatar name={title} color={color} size={52} src={photo} />
      <span className="conversation-copy">
        <span className="conversation-top">
          <span className="conversation-title">
            <span className="conversation-name">{title}</span>
            {type === 'global' && <span className="kind-pill quiet">رئيسية</span>}
            {type === 'group' && <span className="kind-pill quiet">مجموعة</span>}
          </span>
          {muted && <IonIcon className="mute-mark" icon={notificationsOffOutline} />}
          {time && <time className="conversation-time">{time}</time>}
        </span>
        {detail && <span className="conversation-detail">{detail}</span>}
        <span className="conversation-bottom">
          <span className={deleted ? 'conversation-preview is-deleted' : muted ? 'conversation-preview is-muted' : 'conversation-preview'}>
            {deleted && <IonIcon icon={banOutline} />}
            <EmojiText text={muted ?? preview} />
          </span>
          {unread > 0 && <span className="unread-count">{unread}</span>}
        </span>
      </span>
    </button>
  );
}
