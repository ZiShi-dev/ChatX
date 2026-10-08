ALTER TABLE users ADD COLUMN bio text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN banner text;

ALTER TABLE users ADD CONSTRAINT users_bio_length CHECK (char_length(bio) <= 160);
ALTER TABLE users ADD CONSTRAINT users_banner_length CHECK (banner IS NULL OR octet_length(banner) <= 180000);
