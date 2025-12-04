-- Migration: Create prediction leaderboard tables
-- This stores daily winners and maintains an all-time leaderboard

-- Table for storing daily game results
CREATE TABLE IF NOT EXISTS prediction_daily_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_date DATE NOT NULL UNIQUE,
  midnight_price DECIMAL(12, 2) NOT NULL,
  
  -- Winner details (1st place)
  winner_username TEXT NOT NULL,
  winner_avatar TEXT,
  winner_prediction DECIMAL(12, 2) NOT NULL,
  winner_difference DECIMAL(12, 2) NOT NULL,
  winner_timestamp TIMESTAMPTZ NOT NULL,
  
  -- 2nd place
  second_username TEXT,
  second_avatar TEXT,
  second_prediction DECIMAL(12, 2),
  second_difference DECIMAL(12, 2),
  second_timestamp TIMESTAMPTZ,
  
  -- 3rd place
  third_username TEXT,
  third_avatar TEXT,
  third_prediction DECIMAL(12, 2),
  third_difference DECIMAL(12, 2),
  third_timestamp TIMESTAMPTZ,
  
  -- Metadata
  total_participants INTEGER DEFAULT 0,
  total_predictions INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Index for fast lookups
  CONSTRAINT valid_game_date CHECK (game_date <= CURRENT_DATE)
);

-- Table for all-time leaderboard (aggregated stats per user)
CREATE TABLE IF NOT EXISTS prediction_leaderboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  avatar TEXT,
  
  -- Points system: 1st = 3pts, 2nd = 2pts, 3rd = 1pt
  total_points INTEGER DEFAULT 0,
  
  -- Win counts
  first_place_count INTEGER DEFAULT 0,
  second_place_count INTEGER DEFAULT 0,
  third_place_count INTEGER DEFAULT 0,
  
  -- Stats
  games_played INTEGER DEFAULT 0,
  best_prediction_diff DECIMAL(12, 2), -- Closest ever prediction
  best_prediction_date DATE,
  
  -- Streak tracking
  current_streak INTEGER DEFAULT 0, -- Consecutive days with a podium finish
  best_streak INTEGER DEFAULT 0,
  
  -- Timestamps
  first_win_date DATE,
  last_win_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_daily_results_date ON prediction_daily_results(game_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_results_winner ON prediction_daily_results(winner_username);
CREATE INDEX IF NOT EXISTS idx_leaderboard_points ON prediction_leaderboard(total_points DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_username ON prediction_leaderboard(username);

-- Function to update leaderboard when daily results are inserted
CREATE OR REPLACE FUNCTION update_leaderboard_on_result()
RETURNS TRIGGER AS $$
BEGIN
  -- Update winner (1st place - 3 points)
  INSERT INTO prediction_leaderboard (username, avatar, total_points, first_place_count, games_played, first_win_date, last_win_date, best_prediction_diff, best_prediction_date)
  VALUES (NEW.winner_username, NEW.winner_avatar, 3, 1, 1, NEW.game_date, NEW.game_date, NEW.winner_difference, NEW.game_date)
  ON CONFLICT (username) DO UPDATE SET
    avatar = COALESCE(EXCLUDED.avatar, prediction_leaderboard.avatar),
    total_points = prediction_leaderboard.total_points + 3,
    first_place_count = prediction_leaderboard.first_place_count + 1,
    games_played = prediction_leaderboard.games_played + 1,
    last_win_date = NEW.game_date,
    best_prediction_diff = LEAST(prediction_leaderboard.best_prediction_diff, NEW.winner_difference),
    best_prediction_date = CASE 
      WHEN NEW.winner_difference < COALESCE(prediction_leaderboard.best_prediction_diff, 999999) 
      THEN NEW.game_date 
      ELSE prediction_leaderboard.best_prediction_date 
    END,
    updated_at = NOW();

  -- Update 2nd place (2 points)
  IF NEW.second_username IS NOT NULL THEN
    INSERT INTO prediction_leaderboard (username, avatar, total_points, second_place_count, games_played, first_win_date, last_win_date, best_prediction_diff, best_prediction_date)
    VALUES (NEW.second_username, NEW.second_avatar, 2, 1, 1, NEW.game_date, NEW.game_date, NEW.second_difference, NEW.game_date)
    ON CONFLICT (username) DO UPDATE SET
      avatar = COALESCE(EXCLUDED.avatar, prediction_leaderboard.avatar),
      total_points = prediction_leaderboard.total_points + 2,
      second_place_count = prediction_leaderboard.second_place_count + 1,
      games_played = prediction_leaderboard.games_played + 1,
      last_win_date = NEW.game_date,
      best_prediction_diff = LEAST(prediction_leaderboard.best_prediction_diff, NEW.second_difference),
      best_prediction_date = CASE 
        WHEN NEW.second_difference < COALESCE(prediction_leaderboard.best_prediction_diff, 999999) 
        THEN NEW.game_date 
        ELSE prediction_leaderboard.best_prediction_date 
      END,
      updated_at = NOW();
  END IF;

  -- Update 3rd place (1 point)
  IF NEW.third_username IS NOT NULL THEN
    INSERT INTO prediction_leaderboard (username, avatar, total_points, third_place_count, games_played, first_win_date, last_win_date, best_prediction_diff, best_prediction_date)
    VALUES (NEW.third_username, NEW.third_avatar, 1, 1, 1, NEW.game_date, NEW.game_date, NEW.third_difference, NEW.game_date)
    ON CONFLICT (username) DO UPDATE SET
      avatar = COALESCE(EXCLUDED.avatar, prediction_leaderboard.avatar),
      total_points = prediction_leaderboard.total_points + 1,
      third_place_count = prediction_leaderboard.third_place_count + 1,
      games_played = prediction_leaderboard.games_played + 1,
      last_win_date = NEW.game_date,
      best_prediction_diff = LEAST(prediction_leaderboard.best_prediction_diff, NEW.third_difference),
      best_prediction_date = CASE 
        WHEN NEW.third_difference < COALESCE(prediction_leaderboard.best_prediction_diff, 999999) 
        THEN NEW.game_date 
        ELSE prediction_leaderboard.best_prediction_date 
      END,
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_leaderboard ON prediction_daily_results;
CREATE TRIGGER trigger_update_leaderboard
  AFTER INSERT ON prediction_daily_results
  FOR EACH ROW
  EXECUTE FUNCTION update_leaderboard_on_result();

-- Add comments
COMMENT ON TABLE prediction_daily_results IS 'Stores the results of each daily prediction game';
COMMENT ON TABLE prediction_leaderboard IS 'Aggregated all-time leaderboard for prediction game';
COMMENT ON COLUMN prediction_leaderboard.total_points IS 'Points: 1st=3, 2nd=2, 3rd=1';

