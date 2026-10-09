CREATE TABLE room_sync (
  room_id uuid PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  epoch uuid NOT NULL DEFAULT gen_random_uuid(),
  revision bigint NOT NULL DEFAULT 0
);
CREATE TABLE room_changes (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  revision bigint NOT NULL,
  message_id uuid,
  reader_id uuid,
  PRIMARY KEY(room_id, revision)
);

CREATE FUNCTION record_room_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid; mid uuid; uid uuid; rev bigint;
BEGIN
  IF TG_TABLE_NAME = 'room_messages' THEN
    IF TG_OP = 'DELETE' THEN rid := OLD.room_id; mid := OLD.id;
    ELSE rid := NEW.room_id; mid := NEW.id; END IF;
  ELSIF TG_TABLE_NAME = 'message_reactions' THEN
    IF TG_OP = 'DELETE' THEN mid := OLD.message_id; ELSE mid := NEW.message_id; END IF;
    SELECT room_id INTO rid FROM room_messages WHERE id = mid;
  ELSE
    rid := NEW.room_id; uid := NEW.user_id;
    IF NEW.last_read_message_id IS NOT DISTINCT FROM OLD.last_read_message_id THEN RETURN NEW; END IF;
  END IF;
  IF rid IS NULL OR NOT EXISTS (SELECT 1 FROM rooms WHERE id = rid) THEN RETURN NULL; END IF;
  INSERT INTO room_sync(room_id, revision) VALUES(rid, 1)
    ON CONFLICT(room_id) DO UPDATE SET revision = room_sync.revision + 1 RETURNING revision INTO rev;
  INSERT INTO room_changes(room_id, revision, message_id, reader_id) VALUES(rid, rev, mid, uid);
  DELETE FROM room_changes WHERE room_id = rid AND revision <= rev - 1000;
  RETURN NULL;
END $$;
CREATE TRIGGER messages_sync AFTER INSERT OR UPDATE OR DELETE ON room_messages FOR EACH ROW EXECUTE FUNCTION record_room_change();
CREATE TRIGGER reactions_sync AFTER INSERT OR UPDATE OR DELETE ON message_reactions FOR EACH ROW EXECUTE FUNCTION record_room_change();
CREATE TRIGGER readers_sync AFTER UPDATE ON room_members FOR EACH ROW EXECUTE FUNCTION record_room_change();

CREATE TABLE message_uploads (
  id uuid PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('image', 'file')),
  name text NOT NULL,
  size integer NOT NULL CHECK(size BETWEEN 1 AND 262144),
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  reply_to uuid,
  bytes bytea NOT NULL DEFAULT ''::bytea,
  expires_at timestamptz NOT NULL,
  CHECK(octet_length(bytes) <= size)
);
CREATE INDEX message_uploads_owner ON message_uploads(owner_id);
CREATE INDEX message_uploads_expiry ON message_uploads(expires_at);
