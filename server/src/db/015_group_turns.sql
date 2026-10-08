ALTER TABLE rooms ADD COLUMN IF NOT EXISTS turn_user_id uuid REFERENCES users(id);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS turn_opens_at timestamptz;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS turn_round integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS group_turn_done (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  round integer NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (room_id, round, user_id)
);
