CREATE TABLE message_images (
  message_id uuid PRIMARY KEY REFERENCES room_messages (id) ON DELETE CASCADE,
  bytes bytea NOT NULL,
  CONSTRAINT message_images_size CHECK (octet_length(bytes) BETWEEN 1 AND 60000)
);
