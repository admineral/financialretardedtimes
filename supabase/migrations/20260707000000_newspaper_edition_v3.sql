-- Migration: Newspaper edition v3 (tri-edition rewrite)
--
-- 1. newspaper_cache gets generation metadata so one mega-generation can
--    write three rows (day_range 1/3/7) that share a generation_id, and the
--    noon-freshness rule can be evaluated against generated_at instead of
--    updated_at (which also changes on widget patches).
-- 2. newspaper_generation_lock makes the expensive mega-generation
--    single-flight across concurrent visitors and cron.

ALTER TABLE newspaper_cache
  ADD COLUMN IF NOT EXISTS generation_id TEXT,
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS format_version TEXT;

CREATE INDEX IF NOT EXISTS idx_newspaper_cache_generation
  ON newspaper_cache(generation_id);

CREATE TABLE IF NOT EXISTS newspaper_generation_lock (
  lock_key TEXT PRIMARY KEY,
  locked_until TIMESTAMPTZ NOT NULL,
  holder TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE newspaper_generation_lock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to newspaper generation lock"
  ON newspaper_generation_lock
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow anon to manage newspaper generation lock"
  ON newspaper_generation_lock
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated to manage newspaper generation lock"
  ON newspaper_generation_lock
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE newspaper_generation_lock IS 'Single-flight lock for newspaper edition mega-generations';
COMMENT ON COLUMN newspaper_cache.generation_id IS 'Shared id across the 1/3/7-day rows written by one generation run';
COMMENT ON COLUMN newspaper_cache.generated_at IS 'When the AI generation that produced this row started (noon-freshness rule)';
COMMENT ON COLUMN newspaper_cache.format_version IS 'Payload format, e.g. 2026-07-07.edition-v3';
