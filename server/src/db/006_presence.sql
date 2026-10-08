ALTER TABLE sessions ADD COLUMN presence text NOT NULL DEFAULT 'online';

ALTER TABLE sessions ADD CONSTRAINT sessions_presence_check CHECK (presence IN ('online', 'away'));
