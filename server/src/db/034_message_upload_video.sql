-- Resumable uploads: sealed short videos use kind=video (see transfer.ts, VIDEO_BYTES_MAX).
ALTER TABLE message_uploads DROP CONSTRAINT IF EXISTS message_uploads_kind_check;
ALTER TABLE message_uploads ADD CONSTRAINT message_uploads_kind_check CHECK (kind IN ('image', 'file', 'video'));

ALTER TABLE message_uploads DROP CONSTRAINT IF EXISTS message_uploads_size_check;
ALTER TABLE message_uploads ADD CONSTRAINT message_uploads_size_check CHECK (size BETWEEN 1 AND 8388636);
