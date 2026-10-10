ALTER TABLE users ADD COLUMN avatar_decoration text NOT NULL DEFAULT 'none'
  CHECK (avatar_decoration IN ('none', 'orbit', 'laurel', 'prism', 'hat'));
ALTER TABLE users ADD COLUMN profile_effect text NOT NULL DEFAULT 'none'
  CHECK (profile_effect IN ('none', 'aurora', 'stars'));
