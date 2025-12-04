-- Migration: Add time bonus points to leaderboard system
-- Time Bonus: Early predictions get bonus points
-- 00:00-08:00 = +100% bonus
-- 08:00-12:00 = +50% bonus
-- 12:00-18:00 = +25% bonus
-- 18:00-23:00 = +0% bonus

-- Add time bonus columns to daily results
ALTER TABLE prediction_daily_results
ADD COLUMN IF NOT EXISTS winner_time_bonus DECIMAL(4, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS winner_total_points DECIMAL(5, 2) DEFAULT 3,
ADD COLUMN IF NOT EXISTS second_time_bonus DECIMAL(4, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS second_total_points DECIMAL(5, 2) DEFAULT 2,
ADD COLUMN IF NOT EXISTS third_time_bonus DECIMAL(4, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS third_total_points DECIMAL(5, 2) DEFAULT 1;

-- Update leaderboard to use decimal points
ALTER TABLE prediction_leaderboard
ALTER COLUMN total_points TYPE DECIMAL(8, 2);

-- Add bonus points tracking
ALTER TABLE prediction_leaderboard
ADD COLUMN IF NOT EXISTS total_bonus_points DECIMAL(8, 2) DEFAULT 0;

-- Update the trigger function to use time bonus points
CREATE OR REPLACE FUNCTION update_leaderboard_on_result()
RETURNS TRIGGER AS $$
BEGIN
  -- Update winner (1st place - base 3 points + time bonus)
  INSERT INTO prediction_leaderboard (username, avatar, total_points, first_place_count, games_played, first_win_date, last_win_date, best_prediction_diff, best_prediction_date, total_bonus_points)
  VALUES (
    NEW.winner_username, 
    NEW.winner_avatar, 
    COALESCE(NEW.winner_total_points, 3), 
    1, 1, 
    NEW.game_date, NEW.game_date, 
    NEW.winner_difference, NEW.game_date,
    COALESCE(NEW.winner_time_bonus, 0)
  )
  ON CONFLICT (username) DO UPDATE SET
    avatar = COALESCE(EXCLUDED.avatar, prediction_leaderboard.avatar),
    total_points = prediction_leaderboard.total_points + COALESCE(NEW.winner_total_points, 3),
    first_place_count = prediction_leaderboard.first_place_count + 1,
    games_played = prediction_leaderboard.games_played + 1,
    last_win_date = NEW.game_date,
    best_prediction_diff = LEAST(prediction_leaderboard.best_prediction_diff, NEW.winner_difference),
    best_prediction_date = CASE 
      WHEN NEW.winner_difference < COALESCE(prediction_leaderboard.best_prediction_diff, 999999) 
      THEN NEW.game_date 
      ELSE prediction_leaderboard.best_prediction_date 
    END,
    total_bonus_points = prediction_leaderboard.total_bonus_points + COALESCE(NEW.winner_time_bonus, 0),
    updated_at = NOW();

  -- Update 2nd place (base 2 points + time bonus)
  IF NEW.second_username IS NOT NULL THEN
    INSERT INTO prediction_leaderboard (username, avatar, total_points, second_place_count, games_played, first_win_date, last_win_date, best_prediction_diff, best_prediction_date, total_bonus_points)
    VALUES (
      NEW.second_username, 
      NEW.second_avatar, 
      COALESCE(NEW.second_total_points, 2), 
      1, 1, 
      NEW.game_date, NEW.game_date, 
      NEW.second_difference, NEW.game_date,
      COALESCE(NEW.second_time_bonus, 0)
    )
    ON CONFLICT (username) DO UPDATE SET
      avatar = COALESCE(EXCLUDED.avatar, prediction_leaderboard.avatar),
      total_points = prediction_leaderboard.total_points + COALESCE(NEW.second_total_points, 2),
      second_place_count = prediction_leaderboard.second_place_count + 1,
      games_played = prediction_leaderboard.games_played + 1,
      last_win_date = NEW.game_date,
      best_prediction_diff = LEAST(prediction_leaderboard.best_prediction_diff, NEW.second_difference),
      best_prediction_date = CASE 
        WHEN NEW.second_difference < COALESCE(prediction_leaderboard.best_prediction_diff, 999999) 
        THEN NEW.game_date 
        ELSE prediction_leaderboard.best_prediction_date 
      END,
      total_bonus_points = prediction_leaderboard.total_bonus_points + COALESCE(NEW.second_time_bonus, 0),
      updated_at = NOW();
  END IF;

  -- Update 3rd place (base 1 point + time bonus)
  IF NEW.third_username IS NOT NULL THEN
    INSERT INTO prediction_leaderboard (username, avatar, total_points, third_place_count, games_played, first_win_date, last_win_date, best_prediction_diff, best_prediction_date, total_bonus_points)
    VALUES (
      NEW.third_username, 
      NEW.third_avatar, 
      COALESCE(NEW.third_total_points, 1), 
      1, 1, 
      NEW.game_date, NEW.game_date, 
      NEW.third_difference, NEW.game_date,
      COALESCE(NEW.third_time_bonus, 0)
    )
    ON CONFLICT (username) DO UPDATE SET
      avatar = COALESCE(EXCLUDED.avatar, prediction_leaderboard.avatar),
      total_points = prediction_leaderboard.total_points + COALESCE(NEW.third_total_points, 1),
      third_place_count = prediction_leaderboard.third_place_count + 1,
      games_played = prediction_leaderboard.games_played + 1,
      last_win_date = NEW.game_date,
      best_prediction_diff = LEAST(prediction_leaderboard.best_prediction_diff, NEW.third_difference),
      best_prediction_date = CASE 
        WHEN NEW.third_difference < COALESCE(prediction_leaderboard.best_prediction_diff, 999999) 
        THEN NEW.game_date 
        ELSE prediction_leaderboard.best_prediction_date 
      END,
      total_bonus_points = prediction_leaderboard.total_bonus_points + COALESCE(NEW.third_time_bonus, 0),
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update comments
COMMENT ON COLUMN prediction_daily_results.winner_time_bonus IS 'Time bonus multiplier (0-1) based on prediction time';
COMMENT ON COLUMN prediction_daily_results.winner_total_points IS 'Total points including time bonus (base_points * (1 + time_bonus))';
COMMENT ON COLUMN prediction_leaderboard.total_bonus_points IS 'Sum of all time bonus points earned';

