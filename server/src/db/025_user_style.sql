ALTER TABLE users ADD COLUMN IF NOT EXISTS accent_color text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS message_font text;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_accent_color_check;
ALTER TABLE users ADD CONSTRAINT users_accent_color_check
  CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9a-f]{6}$');

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_message_font_check;
ALTER TABLE users ADD CONSTRAINT users_message_font_check
  CHECK (message_font IS NULL OR message_font IN ('system', 'clear', 'rounded', 'classic'));
