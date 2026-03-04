-- Migration: Create sentiment analysis cache table
-- Stores AI-generated sentiment analysis for the BTC TradingView chat sentiment chart

CREATE TABLE IF NOT EXISTS sentiment_analysis_cache (
  id SERIAL PRIMARY KEY,

  -- Unique key to identify the analysis type (e.g. 'sentiment_7d_4h')
  cache_key TEXT NOT NULL UNIQUE,

  -- Full SentimentResponse JSON (matches SentimentResponseSchema)
  data JSONB NOT NULL,

  -- Quick-access metadata
  bucket_count INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  avg_net_sentiment NUMERIC(6, 2),
  trend TEXT CHECK (trend IN ('bullish', 'bearish', 'neutral')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by key and recency
CREATE INDEX IF NOT EXISTS idx_sentiment_cache_key ON sentiment_analysis_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_sentiment_cache_updated ON sentiment_analysis_cache(updated_at DESC);

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_sentiment_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sentiment_cache_updated_at ON sentiment_analysis_cache;
CREATE TRIGGER trigger_sentiment_cache_updated_at
  BEFORE UPDATE ON sentiment_analysis_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_sentiment_cache_updated_at();

-- RLS Policies
ALTER TABLE sentiment_analysis_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to sentiment cache"
  ON sentiment_analysis_cache
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow anon to manage sentiment cache"
  ON sentiment_analysis_cache
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated to manage sentiment cache"
  ON sentiment_analysis_cache
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Comments
COMMENT ON TABLE sentiment_analysis_cache IS 'Caches AI-generated BTC chat sentiment analysis to reduce OpenAI API calls';
COMMENT ON COLUMN sentiment_analysis_cache.cache_key IS 'Unique identifier for the analysis type, e.g. sentiment_7d_4h';
COMMENT ON COLUMN sentiment_analysis_cache.data IS 'Full SentimentResponse JSON from OpenAI (buckets, overallSentiment, divergences)';
