-- Migration: Create prediction market tables
-- Allows users to bet on Rate-Chart participants with virtual credits

-- Table for user credits balance and history
CREATE TABLE IF NOT EXISTS market_user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_identifier TEXT NOT NULL UNIQUE, -- localStorage ID or auth user ID
  display_name TEXT, -- Optional display name
  
  -- Credit balances
  total_credits DECIMAL(12, 2) DEFAULT 1000, -- Start with 1000 credits
  available_credits DECIMAL(12, 2) DEFAULT 1000,
  
  -- Stats
  total_bets_placed INTEGER DEFAULT 0,
  total_bets_won INTEGER DEFAULT 0,
  total_credits_won DECIMAL(12, 2) DEFAULT 0,
  total_credits_lost DECIMAL(12, 2) DEFAULT 0,
  best_win DECIMAL(12, 2) DEFAULT 0,
  current_streak INTEGER DEFAULT 0, -- Consecutive winning bets
  best_streak INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for individual bets
CREATE TABLE IF NOT EXISTS market_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_identifier TEXT NOT NULL REFERENCES market_user_credits(user_identifier) ON DELETE CASCADE,
  
  -- Bet details
  game_date DATE NOT NULL, -- The prediction game date being bet on
  target_username TEXT NOT NULL, -- Who they're betting ON (from Rate-Chart)
  bet_type TEXT NOT NULL CHECK (bet_type IN ('win', 'top3', 'exact_price')), -- Type of bet
  
  -- Amounts
  bet_amount DECIMAL(12, 2) NOT NULL CHECK (bet_amount > 0),
  odds DECIMAL(6, 2) NOT NULL DEFAULT 2.0, -- Payout multiplier if won
  potential_payout DECIMAL(12, 2) NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'won', 'lost', 'cancelled', 'pending_resolution')),
  actual_payout DECIMAL(12, 2) DEFAULT 0,
  
  -- Resolution details
  resolved_at TIMESTAMPTZ,
  final_position INTEGER, -- 1, 2, 3, or NULL if not in top 3
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_user_bet_per_target UNIQUE (user_identifier, game_date, target_username, bet_type)
);

-- Table for market odds/pool (aggregated betting data per target)
CREATE TABLE IF NOT EXISTS market_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_date DATE NOT NULL,
  target_username TEXT NOT NULL,
  target_avatar TEXT,
  
  -- Pool amounts
  total_pool_amount DECIMAL(12, 2) DEFAULT 0,
  total_bets_count INTEGER DEFAULT 0,
  
  -- Calculated odds (updated as bets come in)
  current_odds DECIMAL(6, 2) DEFAULT 2.0,
  implied_probability DECIMAL(5, 4) DEFAULT 0.5, -- 0-1
  
  -- Stats from Rate-Chart
  latest_prediction DECIMAL(12, 2),
  prediction_timestamp TIMESTAMPTZ,
  
  -- Resolution
  final_position INTEGER,
  is_resolved BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_pool_per_day UNIQUE (game_date, target_username)
);

-- Table for daily market summaries
CREATE TABLE IF NOT EXISTS market_daily_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_date DATE NOT NULL UNIQUE,
  
  -- Pool totals
  total_pool_amount DECIMAL(12, 2) DEFAULT 0,
  total_bets_count INTEGER DEFAULT 0,
  unique_bettors INTEGER DEFAULT 0,
  
  -- Resolution
  winning_username TEXT,
  second_place_username TEXT,
  third_place_username TEXT,
  
  total_payouts DECIMAL(12, 2) DEFAULT 0,
  house_profit DECIMAL(12, 2) DEFAULT 0, -- 5% house edge
  
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for credit transactions (audit trail)
CREATE TABLE IF NOT EXISTS market_credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_identifier TEXT NOT NULL REFERENCES market_user_credits(user_identifier) ON DELETE CASCADE,
  
  -- Transaction details
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('bet_placed', 'bet_won', 'bet_lost', 'bet_cancelled', 'daily_bonus', 'initial_credits', 'referral_bonus')),
  amount DECIMAL(12, 2) NOT NULL,
  balance_after DECIMAL(12, 2) NOT NULL,
  
  -- Reference
  bet_id UUID REFERENCES market_bets(id) ON DELETE SET NULL,
  description TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_market_bets_user ON market_bets(user_identifier);
CREATE INDEX IF NOT EXISTS idx_market_bets_game_date ON market_bets(game_date);
CREATE INDEX IF NOT EXISTS idx_market_bets_status ON market_bets(status);
CREATE INDEX IF NOT EXISTS idx_market_bets_target ON market_bets(target_username);
CREATE INDEX IF NOT EXISTS idx_market_pools_date ON market_pools(game_date);
CREATE INDEX IF NOT EXISTS idx_market_credits_user ON market_user_credits(user_identifier);
CREATE INDEX IF NOT EXISTS idx_market_transactions_user ON market_credit_transactions(user_identifier);
CREATE INDEX IF NOT EXISTS idx_market_transactions_date ON market_credit_transactions(created_at DESC);

-- Function to update user credits after a bet is placed
CREATE OR REPLACE FUNCTION process_bet_placement()
RETURNS TRIGGER AS $$
BEGIN
  -- Deduct credits from user
  UPDATE market_user_credits
  SET 
    available_credits = available_credits - NEW.bet_amount,
    total_bets_placed = total_bets_placed + 1,
    updated_at = NOW()
  WHERE user_identifier = NEW.user_identifier;
  
  -- Record transaction
  INSERT INTO market_credit_transactions (
    user_identifier, 
    transaction_type, 
    amount, 
    balance_after,
    bet_id,
    description
  )
  SELECT 
    NEW.user_identifier,
    'bet_placed',
    -NEW.bet_amount,
    available_credits,
    NEW.id,
    'Bet on ' || NEW.target_username || ' for ' || NEW.game_date
  FROM market_user_credits
  WHERE user_identifier = NEW.user_identifier;
  
  -- Update pool
  INSERT INTO market_pools (game_date, target_username, total_pool_amount, total_bets_count)
  VALUES (NEW.game_date, NEW.target_username, NEW.bet_amount, 1)
  ON CONFLICT (game_date, target_username) DO UPDATE SET
    total_pool_amount = market_pools.total_pool_amount + NEW.bet_amount,
    total_bets_count = market_pools.total_bets_count + 1,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to process bet resolution (win/loss)
CREATE OR REPLACE FUNCTION process_bet_resolution()
RETURNS TRIGGER AS $$
DECLARE
  v_payout DECIMAL(12, 2);
BEGIN
  -- Only process if status changed to won or lost
  IF OLD.status = 'active' AND (NEW.status = 'won' OR NEW.status = 'lost') THEN
    IF NEW.status = 'won' THEN
      v_payout := NEW.actual_payout;
      
      -- Add winnings to user
      UPDATE market_user_credits
      SET 
        available_credits = available_credits + v_payout,
        total_credits = total_credits + v_payout - NEW.bet_amount, -- Net gain
        total_bets_won = total_bets_won + 1,
        total_credits_won = total_credits_won + v_payout,
        best_win = GREATEST(best_win, v_payout - NEW.bet_amount),
        current_streak = current_streak + 1,
        best_streak = GREATEST(best_streak, current_streak + 1),
        updated_at = NOW()
      WHERE user_identifier = NEW.user_identifier;
      
      -- Record transaction
      INSERT INTO market_credit_transactions (
        user_identifier, 
        transaction_type, 
        amount, 
        balance_after,
        bet_id,
        description
      )
      SELECT 
        NEW.user_identifier,
        'bet_won',
        v_payout,
        available_credits,
        NEW.id,
        'Won bet on ' || NEW.target_username || ' (Position: ' || COALESCE(NEW.final_position::TEXT, 'N/A') || ')'
      FROM market_user_credits
      WHERE user_identifier = NEW.user_identifier;
      
    ELSE -- Lost
      -- Update stats
      UPDATE market_user_credits
      SET 
        total_credits_lost = total_credits_lost + NEW.bet_amount,
        current_streak = 0, -- Reset streak on loss
        updated_at = NOW()
      WHERE user_identifier = NEW.user_identifier;
      
      -- Record transaction
      INSERT INTO market_credit_transactions (
        user_identifier, 
        transaction_type, 
        amount, 
        balance_after,
        bet_id,
        description
      )
      SELECT 
        NEW.user_identifier,
        'bet_lost',
        0, -- No change, credits already deducted on placement
        available_credits,
        NEW.id,
        'Lost bet on ' || NEW.target_username
      FROM market_user_credits
      WHERE user_identifier = NEW.user_identifier;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_bet_placement ON market_bets;
CREATE TRIGGER trigger_bet_placement
  AFTER INSERT ON market_bets
  FOR EACH ROW
  EXECUTE FUNCTION process_bet_placement();

DROP TRIGGER IF EXISTS trigger_bet_resolution ON market_bets;
CREATE TRIGGER trigger_bet_resolution
  AFTER UPDATE ON market_bets
  FOR EACH ROW
  EXECUTE FUNCTION process_bet_resolution();

-- Add comments
COMMENT ON TABLE market_user_credits IS 'User credit balances for prediction market betting';
COMMENT ON TABLE market_bets IS 'Individual bets placed by users on Rate-Chart participants';
COMMENT ON TABLE market_pools IS 'Aggregated betting pools per target per day';
COMMENT ON TABLE market_daily_summary IS 'Daily summary of market activity and resolutions';
COMMENT ON TABLE market_credit_transactions IS 'Audit trail of all credit movements';

