-- Fix/ensure TradingView cache tables exist
-- This migration ensures all tables are created properly

-- ============================================
-- 1. tv_chat_messages - Chat Message Cache
-- ============================================
CREATE TABLE IF NOT EXISTS tv_chat_messages (
  id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  username TEXT NOT NULL,
  user_id INTEGER,
  text TEXT NOT NULL,
  time TIMESTAMPTZ NOT NULL,
  user_pic TEXT,
  badges JSONB,
  is_moderator BOOLEAN DEFAULT FALSE,
  meta JSONB,
  symbol TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (room_id, id)
);

-- Indexes (create if not exists)
CREATE INDEX IF NOT EXISTS idx_chat_room_time ON tv_chat_messages(room_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_chat_username ON tv_chat_messages(username);

-- Enable RLS
ALTER TABLE tv_chat_messages ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies to avoid conflicts
DROP POLICY IF EXISTS "Anyone can read chat messages" ON tv_chat_messages;
DROP POLICY IF EXISTS "Service can insert chat messages" ON tv_chat_messages;
DROP POLICY IF EXISTS "Service can update chat messages" ON tv_chat_messages;

CREATE POLICY "Anyone can read chat messages" ON tv_chat_messages
  FOR SELECT USING (true);

CREATE POLICY "Service can insert chat messages" ON tv_chat_messages
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update chat messages" ON tv_chat_messages
  FOR UPDATE USING (true);

-- ============================================
-- 2. tv_chat_sync_status - Sync State Per Room
-- ============================================
CREATE TABLE IF NOT EXISTS tv_chat_sync_status (
  room_id TEXT PRIMARY KEY,
  last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  newest_message_time TIMESTAMPTZ,
  oldest_message_time TIMESTAMPTZ,
  total_messages INTEGER DEFAULT 0,
  is_full_history BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE tv_chat_sync_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read sync status" ON tv_chat_sync_status;
DROP POLICY IF EXISTS "Service can insert sync status" ON tv_chat_sync_status;
DROP POLICY IF EXISTS "Service can update sync status" ON tv_chat_sync_status;

CREATE POLICY "Anyone can read sync status" ON tv_chat_sync_status
  FOR SELECT USING (true);

CREATE POLICY "Service can insert sync status" ON tv_chat_sync_status
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update sync status" ON tv_chat_sync_status
  FOR UPDATE USING (true);

-- ============================================
-- 3. tv_user_profiles - User Profile Cache
-- ============================================
CREATE TABLE IF NOT EXISTS tv_user_profiles (
  username TEXT PRIMARY KEY,
  user_id INTEGER,
  display_name TEXT,
  bio TEXT,
  location TEXT,
  website TEXT,
  followers INTEGER,
  following INTEGER,
  ideas_count INTEGER,
  scripts_count INTEGER,
  reputation INTEGER,
  badges JSONB,
  avatar TEXT,
  join_date TIMESTAMPTZ,
  is_online BOOLEAN,
  last_login TIMESTAMPTZ,
  social_links JSONB,
  raw_data JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_fetched ON tv_user_profiles(fetched_at);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON tv_user_profiles(user_id);

-- Enable RLS
ALTER TABLE tv_user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read profiles" ON tv_user_profiles;
DROP POLICY IF EXISTS "Service can insert profiles" ON tv_user_profiles;
DROP POLICY IF EXISTS "Service can update profiles" ON tv_user_profiles;

CREATE POLICY "Anyone can read profiles" ON tv_user_profiles
  FOR SELECT USING (true);

CREATE POLICY "Service can insert profiles" ON tv_user_profiles
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update profiles" ON tv_user_profiles
  FOR UPDATE USING (true);

-- ============================================
-- 4. tv_user_activity_daily - Pre-aggregated Activity
-- ============================================
CREATE TABLE IF NOT EXISTS tv_user_activity_daily (
  room_id TEXT NOT NULL,
  username TEXT NOT NULL,
  date DATE NOT NULL,
  message_count INTEGER DEFAULT 0,
  hour_distribution JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (room_id, username, date)
);

CREATE INDEX IF NOT EXISTS idx_activity_username ON tv_user_activity_daily(username);
CREATE INDEX IF NOT EXISTS idx_activity_date ON tv_user_activity_daily(date DESC);
CREATE INDEX IF NOT EXISTS idx_activity_room_date ON tv_user_activity_daily(room_id, date DESC);

-- Enable RLS
ALTER TABLE tv_user_activity_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read activity" ON tv_user_activity_daily;
DROP POLICY IF EXISTS "Service can insert activity" ON tv_user_activity_daily;
DROP POLICY IF EXISTS "Service can update activity" ON tv_user_activity_daily;

CREATE POLICY "Anyone can read activity" ON tv_user_activity_daily
  FOR SELECT USING (true);

CREATE POLICY "Service can insert activity" ON tv_user_activity_daily
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update activity" ON tv_user_activity_daily
  FOR UPDATE USING (true);

-- ============================================
-- Helper Functions (recreate)
-- ============================================

-- Drop trigger first (before dropping the function it depends on)
DROP TRIGGER IF EXISTS trg_update_activity ON tv_chat_messages;

-- Now drop existing functions
DROP FUNCTION IF EXISTS aggregate_user_activity(TEXT, TEXT, DATE);
DROP FUNCTION IF EXISTS refresh_room_activity(TEXT, DATE);
DROP FUNCTION IF EXISTS update_activity_on_message();

-- Function to aggregate activity from chat messages
CREATE OR REPLACE FUNCTION aggregate_user_activity(
  p_room_id TEXT,
  p_username TEXT,
  p_date DATE
) RETURNS void AS $$
DECLARE
  v_count INTEGER;
  v_hours JSONB;
BEGIN
  -- Count messages and aggregate by hour
  SELECT 
    COUNT(*),
    COALESCE(
      jsonb_object_agg(
        hour_val::TEXT,
        hour_count
      ),
      '{}'::jsonb
    )
  INTO v_count, v_hours
  FROM (
    SELECT 
      EXTRACT(HOUR FROM time)::INTEGER as hour_val,
      COUNT(*) as hour_count
    FROM tv_chat_messages
    WHERE room_id = p_room_id
      AND username = p_username
      AND time::date = p_date
    GROUP BY EXTRACT(HOUR FROM time)
  ) hourly;

  -- Upsert the activity record
  INSERT INTO tv_user_activity_daily (room_id, username, date, message_count, hour_distribution, updated_at)
  VALUES (p_room_id, p_username, p_date, COALESCE(v_count, 0), COALESCE(v_hours, '{}'::jsonb), NOW())
  ON CONFLICT (room_id, username, date)
  DO UPDATE SET
    message_count = COALESCE(v_count, 0),
    hour_distribution = COALESCE(v_hours, '{}'::jsonb),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to refresh all activity for a room on a specific date
CREATE OR REPLACE FUNCTION refresh_room_activity(
  p_room_id TEXT,
  p_date DATE
) RETURNS void AS $$
DECLARE
  v_username TEXT;
BEGIN
  FOR v_username IN
    SELECT DISTINCT username
    FROM tv_chat_messages
    WHERE room_id = p_room_id
      AND time::date = p_date
  LOOP
    PERFORM aggregate_user_activity(p_room_id, v_username, p_date);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to auto-update activity when messages are inserted
CREATE OR REPLACE FUNCTION update_activity_on_message() RETURNS TRIGGER AS $$
BEGIN
  PERFORM aggregate_user_activity(NEW.room_id, NEW.username, NEW.time::date);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trg_update_activity
  AFTER INSERT ON tv_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_activity_on_message();

