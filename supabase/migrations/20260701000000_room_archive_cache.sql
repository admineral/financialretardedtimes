-- Room archive performance caches and fast top-chatter aggregation

CREATE TABLE IF NOT EXISTS room_archive_activity_cache (
  cache_key TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('hourly', 'daily')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_archive_activity_room
  ON room_archive_activity_cache(room_id, updated_at DESC);

COMMENT ON TABLE room_archive_activity_cache IS
  'Caches hourly activity bucket payloads for room archive ranges (daily ranges use date_stats counts).';

CREATE OR REPLACE FUNCTION get_room_top_chatters(
  p_room_id TEXT,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_limit INT DEFAULT 25
)
RETURNS TABLE (
  username TEXT,
  message_count BIGINT,
  user_pic TEXT,
  is_moderator BOOLEAN
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.username,
    COUNT(*)::BIGINT AS message_count,
    MAX(m.user_pic) AS user_pic,
    BOOL_OR(COALESCE(m.is_moderator, false)) AS is_moderator
  FROM tv_chat_messages m
  WHERE m.room_id = p_room_id
    AND m.time >= p_from
    AND m.time <= p_to
  GROUP BY m.username
  ORDER BY message_count DESC
  LIMIT GREATEST(p_limit, 1);
$$;
