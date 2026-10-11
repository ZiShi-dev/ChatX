CREATE TABLE IF NOT EXISTS friendships (
  user_low uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  user_high uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (user_low, user_high),
  CHECK (user_low < user_high)
);
