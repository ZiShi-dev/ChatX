ALTER TABLE message_images DROP CONSTRAINT IF EXISTS message_images_size;
ALTER TABLE message_images ADD CONSTRAINT message_images_size CHECK (
  (bytes IS NOT NULL AND octet_length(bytes) BETWEEN 1 AND 2097180)
  OR (bytes IS NULL AND byte_size IS NOT NULL AND byte_size BETWEEN 1 AND 2097180)
);
