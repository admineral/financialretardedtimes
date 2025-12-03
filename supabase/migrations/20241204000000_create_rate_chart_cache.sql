-- Migration: Create rate_chart_cache table for caching Bitcoin price prediction data
-- This stores the processed predictions to avoid re-fetching and re-parsing messages

CREATE TABLE IF NOT EXISTS rate_chart_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- The date this cache entry is for (YYYY-MM-DD format in Vienna timezone)
  cache_date DATE NOT NULL UNIQUE,
  
  -- Raw messages from the chat API as JSONB
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Processed price guesses as JSONB
  price_guesses JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Number of messages fetched
  message_count INTEGER NOT NULL DEFAULT 0,
  
  -- Number of unique participants with predictions
  participant_count INTEGER NOT NULL DEFAULT 0,
  
  -- Total number of predictions
  prediction_count INTEGER NOT NULL DEFAULT 0,
  
  -- Reset timestamp if BigBangTheory issued a //reset command (nullable)
  reset_timestamp TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups by date
CREATE INDEX IF NOT EXISTS idx_rate_chart_cache_date ON rate_chart_cache(cache_date DESC);

-- Index for finding recent cache entries
CREATE INDEX IF NOT EXISTS idx_rate_chart_cache_updated ON rate_chart_cache(updated_at DESC);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_rate_chart_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on row update
DROP TRIGGER IF EXISTS trigger_rate_chart_cache_updated_at ON rate_chart_cache;
CREATE TRIGGER trigger_rate_chart_cache_updated_at
  BEFORE UPDATE ON rate_chart_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_rate_chart_cache_updated_at();

-- Enable Row Level Security (RLS)
ALTER TABLE rate_chart_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access (anyone can view cached content)
CREATE POLICY "Allow public read access to rate chart cache"
  ON rate_chart_cache
  FOR SELECT
  TO public
  USING (true);

-- Policy: Allow authenticated users to insert/update cache
CREATE POLICY "Allow authenticated users to manage rate chart cache"
  ON rate_chart_cache
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy: Allow anon users to insert/update cache (for API routes)
CREATE POLICY "Allow anon to manage rate chart cache"
  ON rate_chart_cache
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Comment on table
COMMENT ON TABLE rate_chart_cache IS 'Stores cached Bitcoin price prediction data by date to reduce API calls';
COMMENT ON COLUMN rate_chart_cache.cache_date IS 'The date (YYYY-MM-DD) this prediction data is for (Vienna timezone)';
COMMENT ON COLUMN rate_chart_cache.messages IS 'Raw chat messages fetched from the API';
COMMENT ON COLUMN rate_chart_cache.price_guesses IS 'Processed price predictions extracted from messages';
COMMENT ON COLUMN rate_chart_cache.message_count IS 'Number of chat messages fetched';
COMMENT ON COLUMN rate_chart_cache.participant_count IS 'Number of unique users with predictions';
COMMENT ON COLUMN rate_chart_cache.prediction_count IS 'Total number of predictions made';
COMMENT ON COLUMN rate_chart_cache.reset_timestamp IS 'Timestamp of //reset command if issued by BigBangTheory';

