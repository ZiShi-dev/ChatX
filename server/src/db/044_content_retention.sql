CREATE TABLE content_retention (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  last_error text,
  last_deleted integer NOT NULL DEFAULT 0
);

INSERT INTO content_retention (id, enabled) VALUES (true, false);
