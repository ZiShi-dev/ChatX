ALTER TABLE sessions ADD COLUMN last_seen_at timestamptz;
UPDATE sessions SET last_seen_at = created_at WHERE last_seen_at IS NULL;
ALTER TABLE sessions ALTER COLUMN last_seen_at SET NOT NULL;

CREATE TABLE auth_throttle (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  state jsonb NOT NULL
);
