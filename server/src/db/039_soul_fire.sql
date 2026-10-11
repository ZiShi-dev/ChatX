ALTER TABLE users DROP CONSTRAINT users_avatar_decoration_check;
ALTER TABLE users ADD CONSTRAINT users_avatar_decoration_check
  CHECK (avatar_decoration IN ('none', 'orbit', 'laurel', 'prism', 'hat', 'hat-rain', 'dragon', 'soul-fire'));
