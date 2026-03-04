-- Migration: Create leaderboard analysis cache table
-- Stores AI-generated trader leaderboard to avoid repeated OpenAI calls

CREATE TABLE IF NOT EXISTS leaderboard_analysis_cache (
  id SERIAL PRIMARY KEY,

  -- Cache key (e.g. 'leaderboard_7d')
  cache_key TEXT NOT NULL UNIQUE,

  -- Full leaderboard response as JSONB (matches LeaderboardResponseSchema)
  data JSONB NOT NULL,

  -- Metadata
  entry_count INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leaderboard_cache_key ON leaderboard_analysis_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_leaderboard_cache_updated ON leaderboard_analysis_cache(updated_at DESC);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_leaderboard_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_leaderboard_cache_updated_at ON leaderboard_analysis_cache;
CREATE TRIGGER trigger_leaderboard_cache_updated_at
  BEFORE UPDATE ON leaderboard_analysis_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_leaderboard_cache_updated_at();

-- RLS Policies
ALTER TABLE leaderboard_analysis_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to leaderboard cache"
  ON leaderboard_analysis_cache
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow anon to manage leaderboard cache"
  ON leaderboard_analysis_cache
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated to manage leaderboard cache"
  ON leaderboard_analysis_cache
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE leaderboard_analysis_cache IS 'Caches AI-generated trader leaderboard analysis';
