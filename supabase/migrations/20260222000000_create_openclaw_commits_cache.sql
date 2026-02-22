-- Migration: Create openclaw_commits_cache table for caching GitHub commits
-- Caches commits from openclaw/openclaw repository to reduce GitHub API calls
-- Syncs incrementally - only fetches new commits on refresh

CREATE TABLE IF NOT EXISTS openclaw_commits_cache (
  -- Use sha as primary key since it's unique per commit
  sha TEXT PRIMARY KEY,
  
  -- Commit metadata
  short_sha TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- Author information
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  author_username TEXT,
  author_avatar TEXT,
  author_profile_url TEXT,
  
  -- Commit date (stored as timestamptz for proper timezone handling)
  committed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Computed date for grouping (YYYY-MM-DD in UTC)
  commit_date DATE NOT NULL,
  
  -- Commit URL on GitHub
  url TEXT NOT NULL,
  
  -- Is this a merge commit?
  is_merge BOOLEAN NOT NULL DEFAULT false,
  
  -- Repository info (for future multi-repo support)
  repo_owner TEXT NOT NULL DEFAULT 'openclaw',
  repo_name TEXT NOT NULL DEFAULT 'openclaw',
  
  -- Timestamps
  cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups by date (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_openclaw_commits_date ON openclaw_commits_cache(commit_date DESC);

-- Index for finding commits by repository
CREATE INDEX IF NOT EXISTS idx_openclaw_commits_repo ON openclaw_commits_cache(repo_owner, repo_name);

-- Index for finding commits by author
CREATE INDEX IF NOT EXISTS idx_openclaw_commits_author ON openclaw_commits_cache(author_username);

-- Index for recent commits (for incremental sync)
CREATE INDEX IF NOT EXISTS idx_openclaw_commits_committed ON openclaw_commits_cache(committed_at DESC);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_openclaw_commits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on row update
DROP TRIGGER IF EXISTS trigger_openclaw_commits_updated_at ON openclaw_commits_cache;
CREATE TRIGGER trigger_openclaw_commits_updated_at
  BEFORE UPDATE ON openclaw_commits_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_openclaw_commits_updated_at();

-- Enable Row Level Security (RLS)
ALTER TABLE openclaw_commits_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access
CREATE POLICY "Allow public read access to openclaw commits cache"
  ON openclaw_commits_cache
  FOR SELECT
  TO public
  USING (true);

-- Policy: Allow anon to insert/update cache (for API routes)
CREATE POLICY "Allow anon to manage openclaw commits cache"
  ON openclaw_commits_cache
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Comments
COMMENT ON TABLE openclaw_commits_cache IS 'Caches GitHub commits from openclaw/openclaw to reduce API calls';
COMMENT ON COLUMN openclaw_commits_cache.sha IS 'Full commit SHA (40 characters)';
COMMENT ON COLUMN openclaw_commits_cache.commit_date IS 'Date of commit in UTC for grouping by day';
COMMENT ON COLUMN openclaw_commits_cache.committed_at IS 'Full timestamp of commit for timezone display';

-- ============================================================================
-- Daily stats view for quick aggregation
-- ============================================================================

CREATE OR REPLACE VIEW openclaw_daily_stats AS
SELECT 
  commit_date,
  COUNT(*) as commit_count,
  COUNT(DISTINCT COALESCE(author_username, author_name)) as unique_contributors,
  COUNT(*) FILTER (WHERE is_merge) as merge_count,
  MIN(committed_at) as first_commit,
  MAX(committed_at) as last_commit,
  repo_owner,
  repo_name
FROM openclaw_commits_cache
GROUP BY commit_date, repo_owner, repo_name
ORDER BY commit_date DESC;

COMMENT ON VIEW openclaw_daily_stats IS 'Aggregated daily statistics for commits';

-- ============================================================================
-- Settings/preferences table for OpenClaw
-- ============================================================================

CREATE TABLE IF NOT EXISTS openclaw_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Settings key (e.g., 'default', 'user_123')
  settings_key TEXT NOT NULL UNIQUE DEFAULT 'default',
  
  -- Default time range in days for initial load
  default_days INTEGER NOT NULL DEFAULT 7,
  
  -- Maximum commits to fetch per sync
  max_commits_per_sync INTEGER NOT NULL DEFAULT 100,
  
  -- Cache duration in hours (for 'use cache')
  cache_duration_hours INTEGER NOT NULL DEFAULT 24,
  
  -- Display timezone (e.g., 'Europe/Berlin', 'UTC')
  display_timezone TEXT NOT NULL DEFAULT 'UTC',
  
  -- Last sync info
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_sync_commit_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings
INSERT INTO openclaw_settings (settings_key, default_days, max_commits_per_sync, cache_duration_hours, display_timezone)
VALUES ('default', 7, 100, 24, 'UTC')
ON CONFLICT (settings_key) DO NOTHING;

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_openclaw_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_openclaw_settings_updated_at ON openclaw_settings;
CREATE TRIGGER trigger_openclaw_settings_updated_at
  BEFORE UPDATE ON openclaw_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_openclaw_settings_updated_at();

-- Enable RLS
ALTER TABLE openclaw_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access
CREATE POLICY "Allow public read access to openclaw settings"
  ON openclaw_settings
  FOR SELECT
  TO public
  USING (true);

-- Policy: Allow anon to manage settings (for API routes)
CREATE POLICY "Allow anon to manage openclaw settings"
  ON openclaw_settings
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE openclaw_settings IS 'Stores configuration and preferences for OpenClaw newspaper';
COMMENT ON COLUMN openclaw_settings.default_days IS 'Number of days to load on initial page visit';
COMMENT ON COLUMN openclaw_settings.cache_duration_hours IS 'How long to cache data before refresh (use cache directive)';

-- ============================================================================
-- Newspaper cache for generated AI content (similar to main newspaper)
-- ============================================================================

CREATE TABLE IF NOT EXISTS openclaw_newspaper_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- The date this cache entry is for
  cache_date DATE NOT NULL,
  
  -- Day range (1, 3, 7 days)
  day_range INTEGER NOT NULL DEFAULT 1,
  
  -- Language (en, de)
  language TEXT NOT NULL DEFAULT 'en',
  
  -- The full AI-generated newspaper data as JSONB
  data JSONB NOT NULL,
  
  -- Stats at time of generation
  commit_count INTEGER NOT NULL DEFAULT 0,
  unique_contributors INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint for date + range + language combination
  UNIQUE(cache_date, day_range, language)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_openclaw_newspaper_cache_lookup 
  ON openclaw_newspaper_cache(cache_date DESC, day_range, language);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_openclaw_newspaper_cache_updated_at ON openclaw_newspaper_cache;
CREATE TRIGGER trigger_openclaw_newspaper_cache_updated_at
  BEFORE UPDATE ON openclaw_newspaper_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_openclaw_commits_updated_at();

-- Enable RLS
ALTER TABLE openclaw_newspaper_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access
CREATE POLICY "Allow public read access to openclaw newspaper cache"
  ON openclaw_newspaper_cache
  FOR SELECT
  TO public
  USING (true);

-- Policy: Allow anon to manage cache
CREATE POLICY "Allow anon to manage openclaw newspaper cache"
  ON openclaw_newspaper_cache
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE openclaw_newspaper_cache IS 'Caches AI-generated newspaper content for OpenClaw';
