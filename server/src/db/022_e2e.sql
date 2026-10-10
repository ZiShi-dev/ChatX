ALTER TABLE users ADD COLUMN e2e_public text CHECK (e2e_public IS NULL OR e2e_public ~ '^[A-Za-z0-9_-]{87}$');

CREATE TABLE user_key_backups (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  salt text NOT NULL CHECK (salt ~ '^[A-Za-z0-9_-]{22}$'),
  iv text NOT NULL CHECK (iv ~ '^[A-Za-z0-9_-]{16}$'),
  data text NOT NULL CHECK (data ~ '^[A-Za-z0-9_-]{32,1024}$'),
  iterations integer NOT NULL CHECK (iterations BETWEEN 100000 AND 2000000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE room_keys (
  room_id uuid NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  key_id uuid NOT NULL,
  member_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  wrapper_id uuid,
  wrapper_public text NOT NULL CHECK (wrapper_public ~ '^[A-Za-z0-9_-]{87}$'),
  wrapped text NOT NULL CHECK (wrapped ~ '^[A-Za-z0-9_-]{16,200}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, key_id, member_id)
);
CREATE INDEX room_keys_member ON room_keys (member_id, room_id);

ALTER TABLE room_messages DROP CONSTRAINT IF EXISTS room_messages_body_check;
ALTER TABLE room_messages ADD CONSTRAINT room_messages_body_length CHECK (char_length(body) <= 16400);

ALTER TABLE message_images DROP CONSTRAINT IF EXISTS message_images_size;
ALTER TABLE message_images ADD CONSTRAINT message_images_size CHECK (octet_length(bytes) BETWEEN 1 AND 60028);
ALTER TABLE message_files DROP CONSTRAINT IF EXISTS message_files_bytes_check;
ALTER TABLE message_files ADD CONSTRAINT message_files_bytes_check CHECK (octet_length(bytes) BETWEEN 1 AND 262172);
ALTER TABLE message_uploads DROP CONSTRAINT IF EXISTS message_uploads_size_check;
ALTER TABLE message_uploads ADD CONSTRAINT message_uploads_size_check CHECK (size BETWEEN 1 AND 262172);
ALTER TABLE message_uploads ADD COLUMN sealed text CHECK (sealed IS NULL OR char_length(sealed) <= 1000);
