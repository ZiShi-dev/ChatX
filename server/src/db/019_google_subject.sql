ALTER TABLE users ADD COLUMN google_sub text UNIQUE;
CREATE INDEX sessions_expiry ON sessions(expires_at);
