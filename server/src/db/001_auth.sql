CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  username text NOT NULL,
  role text NOT NULL CHECK (role IN ('creator', 'admin', 'member')),
  password_hash text,
  totp_enabled boolean NOT NULL DEFAULT false,
  totp_secret_encrypted text,
  totp_pending_encrypted text,
  totp_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_one_creator ON users (role) WHERE role = 'creator';

CREATE TABLE recovery_codes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  UNIQUE (user_id, code_hash)
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  totp_verified boolean NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX sessions_user_id ON sessions (user_id);

CREATE TABLE enrollment_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('enroll', 'reenroll')),
  expires_at timestamptz NOT NULL
);

CREATE TABLE security_events (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN (
    'login_success',
    'login_failed',
    'totp_enrollment',
    'totp_failed',
    'recovery_code_used',
    'admin_session_created'
  )),
  user_id uuid,
  created_at timestamptz NOT NULL
);
