-- PostgreSQL regex bounds stop at 255, so the length is checked on its own.
ALTER TABLE user_key_backups DROP CONSTRAINT IF EXISTS user_key_backups_data_check;
ALTER TABLE user_key_backups ADD CONSTRAINT user_key_backups_data_check
  CHECK (data ~ '^[A-Za-z0-9_-]+$' AND char_length(data) BETWEEN 32 AND 1024);
