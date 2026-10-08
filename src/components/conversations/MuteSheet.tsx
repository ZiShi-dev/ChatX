import { createPortal } from 'react-dom';
import { notifyLevel, ROOM_NOTIFY_LEVELS, useMuteStore } from '../../stores/muteStore';
import type { Conversation } from '../../types/conversation';

type MuteSheetProps = {
  conversation: Conversation;
  title: string;
  onClose: () => void;
};

export default function MuteSheet({ conversation, title, onClose }: MuteSheetProps) {
  const mutes = useMuteStore((state) => state.mutes);
  const setLevel = useMuteStore((state) => state.setLevel);
  const level = notifyLevel(mutes, conversation.id);
  const choices = ROOM_NOTIFY_LEVELS;

  return createPortal(
    <div className="app-scrim sheet" onClick={onClose}>
      <div className="app-sheet" role="dialog" onClick={(event) => event.stopPropagation()}>
        <span className="app-handle" />
        <p className="notify-heading">إشعارات المحادثة</p>
        <p className="mute-title">{title}</p>
        <div className="notify-level" role="radiogroup" aria-label="إشعارات المحادثة">
          {choices.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={level === item.id}
              className={level === item.id ? 'is-on' : undefined}
              onClick={() => setLevel(conversation.id, item.id)}
            >
              <span>{item.label}</span>
              <i />
            </button>
          ))}
        </div>
        <button type="button" className="cancel" onClick={onClose}>إغلاق</button>
      </div>
    </div>,
    document.body,
  );
}
