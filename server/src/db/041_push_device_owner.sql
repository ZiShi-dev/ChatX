-- One installation belongs to the most recently registered account.
DELETE FROM push_tokens older USING push_tokens newer
WHERE older.token = newer.token
  AND (older.updated_at, older.user_id) < (newer.updated_at, newer.user_id);
CREATE UNIQUE INDEX push_tokens_device_unique ON push_tokens (token);
