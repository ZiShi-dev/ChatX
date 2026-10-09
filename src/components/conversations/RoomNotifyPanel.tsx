import { IonToggle } from '@ionic/react';
import { notificationPresentation } from '../../lib/inbox';
import { roomAllows, ROOM_KINDS, useMuteStore, type RoomKind } from '../../stores/muteStore';

const HINTS: Record<RoomKind, string> = {
  message: 'كل رسالة عادية',
  mention: 'عندما يُذكر اسمك',
  reply: 'عندما يرد أحد على رسالتك',
  everyone: 'عندما يُنادى الجميع',
  signal: 'دور الاسم والصورة، والتنبيهات',
  reaction: 'عندما يتفاعل أحد مع رسالتك',
};

const ROOM_ONLY = new Set<RoomKind>(['everyone', 'signal']);

type RoomNotifyPanelProps = {
  conversationId: string;
  room?: boolean;
};

export default function RoomNotifyPanel({ conversationId, room = false }: RoomNotifyPanelProps) {
  const mutes = useMuteStore((state) => state.mutes);
  const setKind = useMuteStore((state) => state.setKind);
  const setKinds = useMuteStore((state) => state.setKinds);
  const kinds = ROOM_KINDS.filter((kind) => room || !ROOM_ONLY.has(kind));
  const enabledCount = kinds.filter((kind) => roomAllows(mutes, conversationId, kind)).length;
  const note = enabledCount === 0
    ? 'مكتوم. تبقى ظاهرة في الإشعارات بدون تنبيه.'
    : enabledCount === kinds.length
      ? 'يصلك كل نوع. يمكنك إيقاف نوع واحد دون كتم الباقي.'
      : 'يصلك ما فعّلته فقط. الباقي يبقى ظاهراً بدون تنبيه.';

  return (
    <>
      <p className="group-block-note">{note}</p>
      <div className="room-notify" role="group" aria-label={room ? 'إشعارات المجموعة' : 'إشعارات المحادثة'}>
        {kinds.map((kind) => {
          const look = notificationPresentation(kind);
          const on = roomAllows(mutes, conversationId, kind);
          return (
            <div key={kind} className="room-notify-row">
              <span>
                <strong dir={look.ltr ? 'ltr' : undefined}>{look.label}</strong>
                <small>{HINTS[kind]}</small>
              </span>
              <IonToggle
                checked={on}
                aria-label={look.label}
                onIonChange={(event) => {
                  if (event.detail.checked === on) return;
                  setKind(conversationId, kind, event.detail.checked);
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="room-notify-actions">
        <button type="button" onClick={() => setKinds(conversationId, kinds, true)} disabled={enabledCount === kinds.length}>
          تفعيل الكل
        </button>
        <button type="button" onClick={() => setKinds(conversationId, kinds, false)} disabled={enabledCount === 0}>
          كتم الكل
        </button>
      </div>
    </>
  );
}
