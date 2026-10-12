CREATE TABLE media_purge_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_error text,
  last_expired_images integer NOT NULL DEFAULT 0,
  last_expired_files integer NOT NULL DEFAULT 0,
  last_orphans integer NOT NULL DEFAULT 0
);
