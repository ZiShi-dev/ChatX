ALTER TABLE users DROP CONSTRAINT users_profile_effect_check;
ALTER TABLE users ADD CONSTRAINT users_profile_effect_check
  CHECK (profile_effect IN ('none', 'aurora', 'stars', 'meteors', 'celestial-dragon', 'sword-domain', 'time-cicada', 'jade-lotus', 'heavenly-tribulation', 'jade-petals', 'spirit-embers'));
