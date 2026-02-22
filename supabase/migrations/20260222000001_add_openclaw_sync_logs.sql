-- Migration: Add sync logs and language preference for OpenClaw
-- Tracks sync history and stores user language preference

-- ============================================================================
-- Add language column to settings
-- ============================================================================

ALTER TABLE openclaw_settings 
ADD COLUMN IF NOT EXISTS default_language TEXT NOT NULL DEFAULT 'en';

-- Update existing row
UPDATE openclaw_settings 
SET default_language = 'en' 
WHERE settings_key = 'default' AND default_language IS NULL;

COMMENT ON COLUMN openclaw_settings.default_language IS 'Default language for the newspaper (en, de)';

-- ============================================================================
-- Sync Logs Table - tracks all sync operations
-- ============================================================================

CREATE TABLE IF NOT EXISTS openclaw_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Sync type
  sync_type TEXT NOT NULL DEFAULT 'incremental', -- 'incremental', 'full', 'initialize'
  
  -- Results
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'success', 'error'
  commits_fetched INTEGER NOT NULL DEFAULT 0,
  commits_new INTEGER NOT NULL DEFAULT 0,
  commits_updated INTEGER NOT NULL DEFAULT 0,
  
  -- Error info (if failed)
  error_message TEXT,
  
  -- Timing
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER,
  
  -- Context
  triggered_by TEXT DEFAULT 'manual', -- 'manual', 'auto', 'cron'
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for recent logs
CREATE INDEX IF NOT EXISTS idx_openclaw_sync_logs_started ON openclaw_sync_logs(started_at DESC);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_openclaw_sync_logs_status ON openclaw_sync_logs(status);

-- Enable RLS
ALTER TABLE openclaw_sync_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access
CREATE POLICY "Allow public read access to openclaw sync logs"
  ON openclaw_sync_logs
  FOR SELECT
  TO public
  USING (true);

-- Policy: Allow anon to insert logs
CREATE POLICY "Allow anon to manage openclaw sync logs"
  ON openclaw_sync_logs
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE openclaw_sync_logs IS 'Tracks all sync operations for debugging and monitoring';

-- ============================================================================
-- View for sync statistics
-- ============================================================================

CREATE OR REPLACE VIEW openclaw_sync_stats AS
SELECT 
  COUNT(*) as total_syncs,
  COUNT(*) FILTER (WHERE status = 'success') as successful_syncs,
  COUNT(*) FILTER (WHERE status = 'error') as failed_syncs,
  SUM(commits_new) as total_commits_added,
  AVG(duration_ms) FILTER (WHERE status = 'success') as avg_duration_ms,
  MAX(started_at) FILTER (WHERE status = 'success') as last_successful_sync,
  MAX(started_at) FILTER (WHERE status = 'error') as last_failed_sync
FROM openclaw_sync_logs;

COMMENT ON VIEW openclaw_sync_stats IS 'Aggregated sync statistics';
