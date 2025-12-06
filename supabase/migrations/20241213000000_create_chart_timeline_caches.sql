-- Migration: Create chart timeline caching tables for OHLC prices and AI analysis
-- This reduces CoinGecko and OpenAI API calls significantly

-- ============================================
-- 1. OHLC Price Cache Table
-- ============================================
-- Stores BTC candlestick data per timeframe to avoid repeated CoinGecko calls

CREATE TABLE IF NOT EXISTS chart_timeline_ohlc_cache (
  id SERIAL PRIMARY KEY,
  
  -- Timeframe identifier: '15m', '1H', '1D', '1W', '1M'
  timeframe TEXT NOT NULL,
  
  -- Array of OHLC candles as JSONB [{timestamp, open, high, low, close}, ...]
  candles JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Metadata
  candle_count INTEGER NOT NULL DEFAULT 0,
  first_timestamp BIGINT,  -- Unix timestamp of first candle
  last_timestamp BIGINT,   -- Unix timestamp of last candle
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One cache entry per timeframe
  UNIQUE(timeframe)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ohlc_cache_timeframe ON chart_timeline_ohlc_cache(timeframe);
CREATE INDEX IF NOT EXISTS idx_ohlc_cache_updated ON chart_timeline_ohlc_cache(updated_at DESC);

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_ohlc_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ohlc_cache_updated_at ON chart_timeline_ohlc_cache;
CREATE TRIGGER trigger_ohlc_cache_updated_at
  BEFORE UPDATE ON chart_timeline_ohlc_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_ohlc_cache_updated_at();

-- RLS Policies
ALTER TABLE chart_timeline_ohlc_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to ohlc cache"
  ON chart_timeline_ohlc_cache
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow anon to manage ohlc cache"
  ON chart_timeline_ohlc_cache
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated to manage ohlc cache"
  ON chart_timeline_ohlc_cache
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Comments
COMMENT ON TABLE chart_timeline_ohlc_cache IS 'Caches BTC OHLC price data per timeframe to reduce CoinGecko API calls';
COMMENT ON COLUMN chart_timeline_ohlc_cache.timeframe IS 'Chart timeframe: 15m, 1H, 1D, 1W, 1M';
COMMENT ON COLUMN chart_timeline_ohlc_cache.candles IS 'Array of OHLC candle objects';


-- ============================================
-- 2. AI Analysis Cache Table  
-- ============================================
-- Stores the AI-generated analysis to avoid repeated OpenAI calls

CREATE TABLE IF NOT EXISTS chart_timeline_analysis_cache (
  id SERIAL PRIMARY KEY,
  
  -- Full analysis response as JSONB (matches AnalysisResponseSchema)
  analysis_data JSONB NOT NULL,
  
  -- Metadata
  quote_count INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,  -- Chat messages used
  
  -- Price context at time of analysis
  start_price NUMERIC(12, 2),
  end_price NUMERIC(12, 2),
  price_change_percent NUMERIC(6, 2),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_analysis_cache_updated ON chart_timeline_analysis_cache(updated_at DESC);

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_analysis_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_analysis_cache_updated_at ON chart_timeline_analysis_cache;
CREATE TRIGGER trigger_analysis_cache_updated_at
  BEFORE UPDATE ON chart_timeline_analysis_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_analysis_cache_updated_at();

-- RLS Policies
ALTER TABLE chart_timeline_analysis_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to analysis cache"
  ON chart_timeline_analysis_cache
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow anon to manage analysis cache"
  ON chart_timeline_analysis_cache
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated to manage analysis cache"
  ON chart_timeline_analysis_cache
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Comments
COMMENT ON TABLE chart_timeline_analysis_cache IS 'Caches AI-generated chart timeline analysis to reduce OpenAI API calls';
COMMENT ON COLUMN chart_timeline_analysis_cache.analysis_data IS 'Full AnalysisResponse JSON from OpenAI';
COMMENT ON COLUMN chart_timeline_analysis_cache.quote_count IS 'Number of quotes in the analysis';

