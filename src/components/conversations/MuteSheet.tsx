import { createPortal } from 'react-dom';
import type { Conversation } from '../../types/conversation';
import RoomNotifyPanel from './RoomNotifyPanel';

type MuteSheetProps = {
  conversation: Conversation;
  title: string;
  onClose: () => void;
};

export default function MuteSheet({ conversation, title, onClose }: MuteSheetProps) {
  const room = conversation.type === 'group' || conversation.type === 'global';

  return createPortal(
    <div className="app-scrim sheet" onClick={onClose}>
      <div className="app-sheet" role="dialog" onClick={(event) => event.stopPropagation()}>
        <span className="app-handle" />
        <p className="notify-heading">إشعارات المحادثة</p>
        <p className="mute-title">{title}</p>
        <RoomNotifyPanel conversationId={conversation.id} room={room} />
        <button type="button" className="cancel" onClick={onClose}>إغلاق</button>
      </div>
    </div>,
    document.body,
  );
}
