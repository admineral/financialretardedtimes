-- Migration: Create table to store all daily participants (not just top 3)
-- This allows showing full leaderboard for past games

-- Create table for all daily participants
CREATE TABLE IF NOT EXISTS prediction_daily_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_date DATE NOT NULL,
  username TEXT NOT NULL,
  avatar TEXT,
  prediction DECIMAL(12, 2) NOT NULL,
  prediction_difference DECIMAL(12, 2) NOT NULL,
  prediction_timestamp TIMESTAMPTZ NOT NULL,
  rank INTEGER NOT NULL,
  points_earned DECIMAL(5, 2) DEFAULT 0,
  time_bonus DECIMAL(4, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint: one entry per user per day
  UNIQUE(game_date, username)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_daily_participants_date ON prediction_daily_participants(game_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_participants_rank ON prediction_daily_participants(game_date, rank);

-- Enable RLS
ALTER TABLE prediction_daily_participants ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access to daily participants"
  ON prediction_daily_participants
  FOR SELECT
  TO public
  USING (true);

-- Allow service role full access
CREATE POLICY "Allow service role full access to daily participants"
  ON prediction_daily_participants
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE prediction_daily_participants IS 'Stores all participants for each daily prediction game';
COMMENT ON COLUMN prediction_daily_participants.rank IS 'Final ranking position (1-based)';
COMMENT ON COLUMN prediction_daily_participants.points_earned IS 'Points earned (3 for 1st, 2 for 2nd, 1 for 3rd, 0 otherwise)';
