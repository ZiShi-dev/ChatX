CREATE TABLE message_files (
  message_id uuid PRIMARY KEY REFERENCES room_messages (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 262144)
);
