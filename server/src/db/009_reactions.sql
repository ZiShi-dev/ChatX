CREATE TABLE IF NOT EXISTS message_reactions (
  message_id uuid NOT NULL REFERENCES room_messages (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_pkey;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('mention', 'everyone', 'reply', 'signal', 'message', 'reaction'));
ALTER TABLE notifications ADD PRIMARY KEY (user_id, message_id, kind);

ALTER TABLE room_members ADD COLUMN IF NOT EXISTS last_read_message_id uuid REFERENCES room_messages (id) ON DELETE SET NULL;
