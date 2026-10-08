CREATE TABLE rooms (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('global', 'group', 'private')),
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX rooms_one_global ON rooms (kind) WHERE kind = 'global';

INSERT INTO rooms (id, kind, name, created_at)
VALUES ('00000000-0000-4000-8000-000000000001', 'global', 'ChatX', '2026-01-01T00:00:00Z');

CREATE TABLE room_members (
  room_id uuid NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  last_read_at timestamptz,
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE room_messages (
  id uuid PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users (id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false,
  CHECK (char_length(body) <= 4000)
);

CREATE INDEX room_messages_room_created ON room_messages (room_id, created_at DESC);
