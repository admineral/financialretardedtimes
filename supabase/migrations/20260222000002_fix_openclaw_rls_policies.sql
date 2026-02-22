-- Migration: Fix RLS policies for OpenClaw tables
-- Ensures both anon and authenticated roles can manage the cache

-- ============================================================================
-- Fix openclaw_commits_cache policies
-- ============================================================================

-- Drop existing policies first
DROP POLICY IF EXISTS "Allow public read access to openclaw commits cache" ON openclaw_commits_cache;
DROP POLICY IF EXISTS "Allow anon to manage openclaw commits cache" ON openclaw_commits_cache;

-- Recreate with proper permissions
CREATE POLICY "openclaw_commits_cache_select"
  ON openclaw_commits_cache
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "openclaw_commits_cache_insert"
  ON openclaw_commits_cache
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "openclaw_commits_cache_update"
  ON openclaw_commits_cache
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "openclaw_commits_cache_delete"
  ON openclaw_commits_cache
  FOR DELETE
  TO anon, authenticated
  USING (true);

-- ============================================================================
-- Fix openclaw_settings policies
-- ============================================================================

DROP POLICY IF EXISTS "Allow public read access to openclaw settings" ON openclaw_settings;
DROP POLICY IF EXISTS "Allow anon to manage openclaw settings" ON openclaw_settings;

CREATE POLICY "openclaw_settings_select"
  ON openclaw_settings
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "openclaw_settings_insert"
  ON openclaw_settings
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "openclaw_settings_update"
  ON openclaw_settings
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "openclaw_settings_delete"
  ON openclaw_settings
  FOR DELETE
  TO anon, authenticated
  USING (true);

-- ============================================================================
-- Fix openclaw_sync_logs policies
-- ============================================================================

DROP POLICY IF EXISTS "Allow public read access to openclaw sync logs" ON openclaw_sync_logs;
DROP POLICY IF EXISTS "Allow anon to manage openclaw sync logs" ON openclaw_sync_logs;

CREATE POLICY "openclaw_sync_logs_select"
  ON openclaw_sync_logs
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "openclaw_sync_logs_insert"
  ON openclaw_sync_logs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "openclaw_sync_logs_update"
  ON openclaw_sync_logs
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "openclaw_sync_logs_delete"
  ON openclaw_sync_logs
  FOR DELETE
  TO anon, authenticated
  USING (true);

-- ============================================================================
-- Fix openclaw_newspaper_cache policies
-- ============================================================================

DROP POLICY IF EXISTS "Allow public read access to openclaw newspaper cache" ON openclaw_newspaper_cache;
DROP POLICY IF EXISTS "Allow anon to manage openclaw newspaper cache" ON openclaw_newspaper_cache;

CREATE POLICY "openclaw_newspaper_cache_select"
  ON openclaw_newspaper_cache
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "openclaw_newspaper_cache_insert"
  ON openclaw_newspaper_cache
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "openclaw_newspaper_cache_update"
  ON openclaw_newspaper_cache
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "openclaw_newspaper_cache_delete"
  ON openclaw_newspaper_cache
  FOR DELETE
  TO anon, authenticated
  USING (true);
