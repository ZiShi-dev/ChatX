CREATE TABLE invites (
  id uuid PRIMARY KEY,
  code_hash text NOT NULL UNIQUE,
  code_encrypted text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  used_by uuid REFERENCES users (id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX users_username_lower ON users (lower(username));
