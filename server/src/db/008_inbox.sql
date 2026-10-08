ALTER TABLE room_messages
  ADD COLUMN reply_to uuid REFERENCES room_messages (id) ON DELETE SET NULL;

CREATE TABLE notifications (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES room_messages (id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('mention', 'everyone', 'reply', 'signal', 'message')),
  read_at timestamptz,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, message_id)
);

CREATE INDEX notifications_user_created ON notifications (user_id, created_at DESC);

CREATE TABLE inbox_state (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  cleared_at timestamptz
);

INSERT INTO notifications (user_id, message_id, room_id, kind, created_at)
SELECT rm.user_id, m.id, m.room_id,
  CASE
    WHEN strpos(lower(m.body), '@' || lower(u.username)) > 0 THEN 'mention'
    WHEN m.body ~ '(^|[[:space:]])@everyone([[:space:]]|$)' THEN 'everyone'
    WHEN m.body LIKE 'تنبيه%' THEN 'signal'
    ELSE 'message'
  END,
  m.created_at
FROM room_messages m
JOIN room_members rm ON rm.room_id = m.room_id AND rm.user_id <> m.sender_id
JOIN users u ON u.id = rm.user_id
WHERE NOT m.deleted;
