-- Migration: Create newspaper_cache table for caching AI-generated newspaper content
-- This reduces API calls and improves performance by storing generated summaries

CREATE TABLE IF NOT EXISTS newspaper_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- The date this cache entry is for (YYYY-MM-DD format)
  cache_date DATE NOT NULL UNIQUE,
  
  -- The full AI-generated newspaper data as JSONB
  data JSONB NOT NULL,
  
  -- Number of messages that were used to generate this content
  message_count INTEGER NOT NULL DEFAULT 0,
  
  -- Number of unique users in the chat for this date
  unique_users INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups by date
CREATE INDEX IF NOT EXISTS idx_newspaper_cache_date ON newspaper_cache(cache_date DESC);

-- Index for finding recent cache entries
CREATE INDEX IF NOT EXISTS idx_newspaper_cache_updated ON newspaper_cache(updated_at DESC);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_newspaper_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on row update
DROP TRIGGER IF EXISTS trigger_newspaper_cache_updated_at ON newspaper_cache;
CREATE TRIGGER trigger_newspaper_cache_updated_at
  BEFORE UPDATE ON newspaper_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_newspaper_cache_updated_at();

-- Enable Row Level Security (RLS)
ALTER TABLE newspaper_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access (anyone can view cached content)
CREATE POLICY "Allow public read access to newspaper cache"
  ON newspaper_cache
  FOR SELECT
  TO public
  USING (true);

-- Policy: Allow authenticated users to insert/update cache
CREATE POLICY "Allow authenticated users to manage newspaper cache"
  ON newspaper_cache
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy: Allow anon users to insert/update cache (for API routes)
CREATE POLICY "Allow anon to manage newspaper cache"
  ON newspaper_cache
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Comment on table
COMMENT ON TABLE newspaper_cache IS 'Stores cached AI-generated newspaper content by date to reduce API calls';
COMMENT ON COLUMN newspaper_cache.cache_date IS 'The date (YYYY-MM-DD) this newspaper content is for';
COMMENT ON COLUMN newspaper_cache.data IS 'Full AI-generated newspaper data matching UnifiedNewspaperSchema';
COMMENT ON COLUMN newspaper_cache.message_count IS 'Number of chat messages used to generate this content';
COMMENT ON COLUMN newspaper_cache.unique_users IS 'Number of unique users who contributed to the chat';

