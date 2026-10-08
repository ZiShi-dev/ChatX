ALTER TABLE rooms ADD COLUMN IF NOT EXISTS pair_key text;
CREATE UNIQUE INDEX IF NOT EXISTS rooms_pair_key ON rooms (pair_key) WHERE pair_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS saved_messages (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES room_messages (id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, message_id)
);
