CREATE TABLE owner_audit (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('member', 'group')),
  target_id uuid NOT NULL,
  detail text NOT NULL CHECK (char_length(detail) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX owner_audit_created ON owner_audit (created_at DESC, id DESC);
