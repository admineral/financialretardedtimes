-- Migration: Create dedicated prediction analysis cache table
-- Replaces the shared chat_timeline_cache usage for predictions

CREATE TABLE IF NOT EXISTS prediction_analysis_cache (
  id SERIAL PRIMARY KEY,

  -- Unique key (e.g. 'predictions-7d')
  cache_key TEXT NOT NULL UNIQUE,

  -- Full ExtractResponse JSON (predictions array + summary)
  data JSONB NOT NULL,

  -- Quick-access metadata
  prediction_count INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  current_price NUMERIC(12, 2),
  date_range_start DATE,
  date_range_end DATE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prediction_cache_key ON prediction_analysis_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_prediction_cache_updated ON prediction_analysis_cache(updated_at DESC);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_prediction_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prediction_cache_updated_at ON prediction_analysis_cache;
CREATE TRIGGER trigger_prediction_cache_updated_at
  BEFORE UPDATE ON prediction_analysis_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_prediction_cache_updated_at();

-- RLS
ALTER TABLE prediction_analysis_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to prediction cache"
  ON prediction_analysis_cache FOR SELECT TO public USING (true);

CREATE POLICY "Allow anon to manage prediction cache"
  ON prediction_analysis_cache FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated to manage prediction cache"
  ON prediction_analysis_cache FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE prediction_analysis_cache IS 'Caches AI-extracted BTC price predictions from chat messages';
COMMENT ON COLUMN prediction_analysis_cache.data IS 'Full ExtractResponse JSON: { predictions[], summary }';
