-- Activity Messages Cache Table
-- Stores sample messages for each user/date for hover card previews

-- ============================================
-- tv_user_activity_messages - Sample Messages for Activity
-- ============================================
CREATE TABLE IF NOT EXISTS tv_user_activity_messages (
  room_id TEXT NOT NULL,
  username TEXT NOT NULL,
  date DATE NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,  -- Array of {id, text, time, avatar}
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (room_id, username, date)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_activity_messages_username ON tv_user_activity_messages(username);
CREATE INDEX IF NOT EXISTS idx_activity_messages_date ON tv_user_activity_messages(date DESC);
CREATE INDEX IF NOT EXISTS idx_activity_messages_room_date ON tv_user_activity_messages(room_id, date DESC);

-- Enable RLS
ALTER TABLE tv_user_activity_messages ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Anyone can read activity messages" ON tv_user_activity_messages;
DROP POLICY IF EXISTS "Service can insert activity messages" ON tv_user_activity_messages;
DROP POLICY IF EXISTS "Service can update activity messages" ON tv_user_activity_messages;

CREATE POLICY "Anyone can read activity messages" ON tv_user_activity_messages
  FOR SELECT USING (true);

CREATE POLICY "Service can insert activity messages" ON tv_user_activity_messages
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update activity messages" ON tv_user_activity_messages
  FOR UPDATE USING (true);

-- Add fetched_at column to tv_user_activity_daily if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tv_user_activity_daily' 
    AND column_name = 'fetched_at'
  ) THEN
    ALTER TABLE tv_user_activity_daily ADD COLUMN fetched_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

