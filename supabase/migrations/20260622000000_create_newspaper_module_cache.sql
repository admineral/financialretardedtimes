-- Migration: Create generic newspaper module cache
-- Stores date/range aware module outputs for standalone and composed newspaper blocks.

CREATE TABLE IF NOT EXISTS newspaper_module_cache (
  id SERIAL PRIMARY KEY,
  module_id TEXT NOT NULL,
  cache_date DATE NOT NULL,
  day_range INTEGER NOT NULL DEFAULT 1,
  module_version TEXT NOT NULL,
  resource_fingerprint TEXT NOT NULL,
  data JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  message_count INTEGER NOT NULL DEFAULT 0,
  unique_users INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT newspaper_module_cache_unique
    UNIQUE (module_id, cache_date, day_range, module_version, resource_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_newspaper_module_cache_lookup
  ON newspaper_module_cache(module_id, cache_date DESC, day_range, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_newspaper_module_cache_updated
  ON newspaper_module_cache(updated_at DESC);

CREATE OR REPLACE FUNCTION update_newspaper_module_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_newspaper_module_cache_updated_at ON newspaper_module_cache;
CREATE TRIGGER trigger_newspaper_module_cache_updated_at
  BEFORE UPDATE ON newspaper_module_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_newspaper_module_cache_updated_at();

ALTER TABLE newspaper_module_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to newspaper module cache"
  ON newspaper_module_cache
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow anon to manage newspaper module cache"
  ON newspaper_module_cache
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated to manage newspaper module cache"
  ON newspaper_module_cache
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE newspaper_module_cache IS 'Date/range aware cache for modular newspaper widget outputs';
COMMENT ON COLUMN newspaper_module_cache.module_id IS 'Stable module id, e.g. trading.traderLeaderboard';
COMMENT ON COLUMN newspaper_module_cache.resource_fingerprint IS 'Stable fingerprint of resource ranges and prompt/module versions';
