CREATE INDEX IF NOT EXISTS notifications_user_unread
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;
