ALTER TABLE message_images ADD COLUMN IF NOT EXISTS byte_size integer;
ALTER TABLE message_images ADD COLUMN IF NOT EXISTS stored_at timestamptz;
ALTER TABLE message_images ALTER COLUMN bytes DROP NOT NULL;

ALTER TABLE message_files ADD COLUMN IF NOT EXISTS byte_size integer;
ALTER TABLE message_files ADD COLUMN IF NOT EXISTS stored_at timestamptz;
ALTER TABLE message_files ALTER COLUMN bytes DROP NOT NULL;

ALTER TABLE message_images DROP CONSTRAINT IF EXISTS message_images_size;
ALTER TABLE message_images ADD CONSTRAINT message_images_size CHECK (
  (bytes IS NOT NULL AND octet_length(bytes) BETWEEN 1 AND 60028)
  OR (bytes IS NULL AND byte_size IS NOT NULL AND byte_size BETWEEN 1 AND 60028)
);

ALTER TABLE message_files DROP CONSTRAINT IF EXISTS message_files_bytes_check;
ALTER TABLE message_files ADD CONSTRAINT message_files_bytes_check CHECK (
  (bytes IS NOT NULL AND octet_length(bytes) BETWEEN 1 AND 262172)
  OR (bytes IS NULL AND byte_size IS NOT NULL AND byte_size BETWEEN 1 AND 262172)
);

CREATE INDEX IF NOT EXISTS message_images_stored_at ON message_images (stored_at) WHERE stored_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS message_files_stored_at ON message_files (stored_at) WHERE stored_at IS NOT NULL;
