ALTER TABLE users DROP CONSTRAINT users_avatar_decoration_check;
ALTER TABLE users ADD CONSTRAINT users_avatar_decoration_check
  CHECK (avatar_decoration IN ('none', 'orbit', 'laurel', 'prism', 'hat', 'dragon'));
ALTER TABLE users DROP CONSTRAINT users_profile_effect_check;
ALTER TABLE users ADD CONSTRAINT users_profile_effect_check
  CHECK (profile_effect IN ('none', 'aurora', 'stars', 'meteors'));
