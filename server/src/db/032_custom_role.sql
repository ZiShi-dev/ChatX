ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_role_label text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_role_colors text;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_custom_role_label_check;
ALTER TABLE users ADD CONSTRAINT users_custom_role_label_check
  CHECK (custom_role_label IS NULL OR (char_length(custom_role_label) BETWEEN 1 AND 32));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_custom_role_colors_check;
ALTER TABLE users ADD CONSTRAINT users_custom_role_colors_check
  CHECK (
    custom_role_colors IS NULL
    OR custom_role_colors ~ '^#[0-9a-f]{6}(,#[0-9a-f]{6}){0,3}$'
  );
