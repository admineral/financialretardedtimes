-- Migration: Add day_range support to newspaper_cache table
-- Allows caching 1-day, 3-day, and 7-day summaries separately

-- Add day_range column to existing table
ALTER TABLE newspaper_cache 
ADD COLUMN IF NOT EXISTS day_range INTEGER NOT NULL DEFAULT 1;

-- Drop the old unique constraint on cache_date
ALTER TABLE newspaper_cache DROP CONSTRAINT IF EXISTS newspaper_cache_cache_date_key;

-- Add new unique constraint on (cache_date, day_range) combination
ALTER TABLE newspaper_cache 
ADD CONSTRAINT newspaper_cache_date_range_unique UNIQUE (cache_date, day_range);

-- Add index for fast lookups by date and day_range
CREATE INDEX IF NOT EXISTS idx_newspaper_cache_date_range 
ON newspaper_cache(cache_date DESC, day_range);

-- Comment on new column
COMMENT ON COLUMN newspaper_cache.day_range IS 'Number of days this cache covers (1, 3, or 7). cache_date is the start date.';


