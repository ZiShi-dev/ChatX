import { IonToggle } from '@ionic/react';
import { notificationPresentation } from '../../lib/inbox';
import { useI18n } from '../../lib/i18n';
import { roomAllows, ROOM_KINDS, useMuteStore, type RoomKind } from '../../stores/muteStore';

const HINT_KEY: Record<RoomKind, 'roomNotify.hint.message' | 'roomNotify.hint.mention' | 'roomNotify.hint.reply' | 'roomNotify.hint.everyone' | 'roomNotify.hint.signal' | 'roomNotify.hint.reaction'> = {
  message: 'roomNotify.hint.message',
  mention: 'roomNotify.hint.mention',
  reply: 'roomNotify.hint.reply',
  everyone: 'roomNotify.hint.everyone',
  signal: 'roomNotify.hint.signal',
  reaction: 'roomNotify.hint.reaction',
};

const ROOM_ONLY = new Set<RoomKind>(['everyone', 'signal']);

type RoomNotifyPanelProps = {
  conversationId: string;
  room?: boolean;
};

export default function RoomNotifyPanel({ conversationId, room = false }: RoomNotifyPanelProps) {
  const { t } = useI18n();
  const mutes = useMuteStore((state) => state.mutes);
  const setKind = useMuteStore((state) => state.setKind);
  const setKinds = useMuteStore((state) => state.setKinds);
  const kinds = ROOM_KINDS.filter((kind) => room || !ROOM_ONLY.has(kind));
  const enabledCount = kinds.filter((kind) => roomAllows(mutes, conversationId, kind)).length;
  const note = enabledCount === 0
    ? t('roomNotify.noteMuted')
    : enabledCount === kinds.length
      ? t('roomNotify.noteAll')
      : t('roomNotify.notePartial');

  return (
    <>
      <p className="group-block-note">{note}</p>
      <div className="room-notify" role="group" aria-label={room ? t('roomNotify.ariaGroup') : t('roomNotify.ariaChat')}>
        {kinds.map((kind) => {
          const look = notificationPresentation(kind);
          const on = roomAllows(mutes, conversationId, kind);
          return (
            <div key={kind} className="room-notify-row">
              <span>
                <strong dir={look.ltr ? 'ltr' : undefined}>{look.label}</strong>
                <small>{t(HINT_KEY[kind])}</small>
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
          {t('roomNotify.enableAll')}
        </button>
        <button type="button" onClick={() => setKinds(conversationId, kinds, false)} disabled={enabledCount === 0}>
          {t('roomNotify.muteAll')}
        </button>
      </div>
    </>
  );
}
