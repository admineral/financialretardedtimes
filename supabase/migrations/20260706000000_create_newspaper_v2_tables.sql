-- Migration: Newspaper v2 (Monthly Edition) tables
-- Stage 1: per-day chat digests (immutable for past days)
-- Stage 2: composed monthly issue cache

CREATE TABLE IF NOT EXISTS newspaper_v2_daily_digests (
  id SERIAL PRIMARY KEY,
  digest_date DATE NOT NULL UNIQUE,
  data JSONB NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  unique_users INTEGER NOT NULL DEFAULT 0,
  model TEXT NOT NULL DEFAULT 'gpt-5.4',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_newspaper_v2_daily_digests_date
  ON newspaper_v2_daily_digests(digest_date DESC);

CREATE TABLE IF NOT EXISTS newspaper_v2_cache (
  id SERIAL PRIMARY KEY,
  issue_date DATE NOT NULL UNIQUE,
  data JSONB NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  unique_users INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_newspaper_v2_cache_date
  ON newspaper_v2_cache(issue_date DESC);

CREATE OR REPLACE FUNCTION update_newspaper_v2_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_newspaper_v2_daily_digests_updated_at ON newspaper_v2_daily_digests;
CREATE TRIGGER trigger_newspaper_v2_daily_digests_updated_at
  BEFORE UPDATE ON newspaper_v2_daily_digests
  FOR EACH ROW
  EXECUTE FUNCTION update_newspaper_v2_updated_at();

DROP TRIGGER IF EXISTS trigger_newspaper_v2_cache_updated_at ON newspaper_v2_cache;
CREATE TRIGGER trigger_newspaper_v2_cache_updated_at
  BEFORE UPDATE ON newspaper_v2_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_newspaper_v2_updated_at();

ALTER TABLE newspaper_v2_daily_digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE newspaper_v2_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to newspaper v2 digests"
  ON newspaper_v2_daily_digests FOR SELECT TO public USING (true);

CREATE POLICY "Allow anon to manage newspaper v2 digests"
  ON newspaper_v2_daily_digests FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated to manage newspaper v2 digests"
  ON newspaper_v2_daily_digests FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read access to newspaper v2 cache"
  ON newspaper_v2_cache FOR SELECT TO public USING (true);

CREATE POLICY "Allow anon to manage newspaper v2 cache"
  ON newspaper_v2_cache FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated to manage newspaper v2 cache"
  ON newspaper_v2_cache FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE newspaper_v2_daily_digests IS 'Stage-1 per-day chat digests for the monthly newspaper (v2)';
COMMENT ON TABLE newspaper_v2_cache IS 'Stage-2 composed monthly newspaper issue (v2), one per issue date';
