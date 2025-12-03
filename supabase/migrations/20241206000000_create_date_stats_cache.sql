-- Create date_stats_cache table for caching available dates statistics
-- This caches the results of the available-dates API to avoid expensive queries

CREATE TABLE IF NOT EXISTS date_stats_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Cache key: we use a single row for the entire stats
  cache_key TEXT UNIQUE NOT NULL DEFAULT 'date_stats',
  -- The cached data as JSONB
  dates JSONB NOT NULL,
  -- Pre-calculated cumulative unique users for 1d, 3d, 7d ranges
  cumulative_users JSONB NOT NULL,
  -- Total statistics
  total_days INTEGER NOT NULL,
  total_messages INTEGER NOT NULL,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_date_stats_cache_key ON date_stats_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_date_stats_cache_updated ON date_stats_cache(updated_at);

-- Add comment
COMMENT ON TABLE date_stats_cache IS 'Caches aggregated date statistics for the newspaper timeline. Refreshed periodically to avoid expensive queries on every page load.';

