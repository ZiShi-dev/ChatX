ALTER TABLE room_messages ADD COLUMN IF NOT EXISTS event boolean NOT NULL DEFAULT false;
