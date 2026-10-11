-- Disk-backed attachments: sealed videos use message_files.byte_size up to VIDEO_BYTES_MAX + overhead.
ALTER TABLE message_files DROP CONSTRAINT IF EXISTS message_files_bytes_check;
ALTER TABLE message_files ADD CONSTRAINT message_files_bytes_check CHECK (
  (bytes IS NOT NULL AND octet_length(bytes) BETWEEN 1 AND 8388636)
  OR (bytes IS NULL AND byte_size IS NOT NULL AND byte_size BETWEEN 1 AND 8388636)
);
