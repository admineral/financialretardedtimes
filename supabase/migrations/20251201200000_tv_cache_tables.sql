-- TradingView Data Cache Tables
-- Created for smart caching of chat messages, user profiles, and activity data

-- ============================================
-- 1. tv_chat_messages - Chat Message Cache
-- ============================================
CREATE TABLE tv_chat_messages (
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

-- Indexes for efficient queries
CREATE INDEX idx_chat_room_time ON tv_chat_messages(room_id, time DESC);
CREATE INDEX idx_chat_username ON tv_chat_messages(username);
-- Note: Date-based queries can use idx_chat_room_time with range conditions on 'time'

-- Enable RLS
ALTER TABLE tv_chat_messages ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read messages
CREATE POLICY "Anyone can read chat messages" ON tv_chat_messages
  FOR SELECT USING (true);

-- Allow service role to insert/update
CREATE POLICY "Service can insert chat messages" ON tv_chat_messages
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update chat messages" ON tv_chat_messages
  FOR UPDATE USING (true);

-- ============================================
-- 2. tv_chat_sync_status - Sync State Per Room
-- ============================================
CREATE TABLE tv_chat_sync_status (
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

-- Allow anyone to read sync status
CREATE POLICY "Anyone can read sync status" ON tv_chat_sync_status
  FOR SELECT USING (true);

-- Allow service role to manage sync status
CREATE POLICY "Service can insert sync status" ON tv_chat_sync_status
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update sync status" ON tv_chat_sync_status
  FOR UPDATE USING (true);

-- ============================================
-- 3. tv_user_profiles - User Profile Cache
-- ============================================
CREATE TABLE tv_user_profiles (
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

-- Index for checking stale profiles
CREATE INDEX idx_profiles_fetched ON tv_user_profiles(fetched_at);
CREATE INDEX idx_profiles_user_id ON tv_user_profiles(user_id);

-- Enable RLS
ALTER TABLE tv_user_profiles ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read profiles
CREATE POLICY "Anyone can read profiles" ON tv_user_profiles
  FOR SELECT USING (true);

-- Allow service role to manage profiles
CREATE POLICY "Service can insert profiles" ON tv_user_profiles
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update profiles" ON tv_user_profiles
  FOR UPDATE USING (true);

-- ============================================
-- 4. tv_user_activity_daily - Pre-aggregated Activity
-- ============================================
CREATE TABLE tv_user_activity_daily (
  room_id TEXT NOT NULL,
  username TEXT NOT NULL,
  date DATE NOT NULL,
  message_count INTEGER DEFAULT 0,
  hour_distribution JSONB,  -- {0: count, 1: count, ...23: count}
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (room_id, username, date)
);

-- Index for efficient activity queries
CREATE INDEX idx_activity_username ON tv_user_activity_daily(username);
CREATE INDEX idx_activity_date ON tv_user_activity_daily(date DESC);
CREATE INDEX idx_activity_room_date ON tv_user_activity_daily(room_id, date DESC);

-- Enable RLS
ALTER TABLE tv_user_activity_daily ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read activity
CREATE POLICY "Anyone can read activity" ON tv_user_activity_daily
  FOR SELECT USING (true);

-- Allow service role to manage activity
CREATE POLICY "Service can insert activity" ON tv_user_activity_daily
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update activity" ON tv_user_activity_daily
  FOR UPDATE USING (true);

-- ============================================
-- Helper Functions
-- ============================================

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
    jsonb_object_agg(
      EXTRACT(HOUR FROM time)::TEXT,
      hour_count
    )
  INTO v_count, v_hours
  FROM (
    SELECT 
      EXTRACT(HOUR FROM time) as hour,
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
  -- Get all unique usernames for this room and date
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

-- Trigger to auto-update activity when messages are inserted
CREATE OR REPLACE FUNCTION update_activity_on_message() RETURNS TRIGGER AS $$
BEGIN
  PERFORM aggregate_user_activity(NEW.room_id, NEW.username, NEW.time::date);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_activity
  AFTER INSERT ON tv_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_activity_on_message();

