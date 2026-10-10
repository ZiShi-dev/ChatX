CREATE TABLE IF NOT EXISTS push_tokens (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'android',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, token)
);

CREATE TABLE IF NOT EXISTS push_prefs (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  quiet text NOT NULL DEFAULT '',
  hidden_kinds text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
