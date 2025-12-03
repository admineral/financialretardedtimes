-- Add insight and top_drivers columns to fear_greed_cache
-- These were previously stored in full_data JSONB, now extracted for easier querying

ALTER TABLE fear_greed_cache 
ADD COLUMN IF NOT EXISTS insight TEXT;

ALTER TABLE fear_greed_cache 
ADD COLUMN IF NOT EXISTS top_drivers TEXT[];

-- Remove old trend_insight column (replaced by insight)
-- Keeping it for backwards compatibility, just renaming conceptually

COMMENT ON COLUMN fear_greed_cache.insight IS 'Short 1-2 sentence explanation of current sentiment';
COMMENT ON COLUMN fear_greed_cache.top_drivers IS 'Array of 2-3 key sentiment drivers as tags';

