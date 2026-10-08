ALTER TABLE users ADD COLUMN avatar text;

ALTER TABLE users ADD CONSTRAINT users_avatar_length CHECK (avatar IS NULL OR octet_length(avatar) <= 80000);
