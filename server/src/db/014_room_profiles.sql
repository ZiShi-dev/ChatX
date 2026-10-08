ALTER TABLE rooms ADD COLUMN IF NOT EXISTS admin_id uuid REFERENCES users(id);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 240);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE room_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;

CREATE INDEX IF NOT EXISTS room_messages_room_cursor ON room_messages (room_id, created_at DESC, id DESC);
