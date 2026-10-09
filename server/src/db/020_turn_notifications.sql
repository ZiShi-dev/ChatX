-- Notify current group members about the latest existing turn announcement too.
-- Preserve existing read flags and users' explicitly cleared inbox history.
INSERT INTO notifications (user_id, message_id, room_id, kind, created_at)
SELECT rm.user_id, latest.id, latest.room_id, 'signal', latest.created_at
FROM (
  SELECT DISTINCT ON (m.room_id) m.id, m.room_id, m.created_at
  FROM room_messages m
  JOIN rooms r ON r.id = m.room_id
  WHERE m.event AND NOT m.deleted AND m.body LIKE 'دور %'
    AND r.kind IN ('group', 'global')
  ORDER BY m.room_id, m.created_at DESC, m.id DESC
) latest
JOIN room_members rm ON rm.room_id = latest.room_id
LEFT JOIN inbox_state state ON state.user_id = rm.user_id
WHERE state.cleared_at IS NULL OR latest.created_at > state.cleared_at
ON CONFLICT (user_id, message_id, kind) DO NOTHING;
