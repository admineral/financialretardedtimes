-- Create fear_greed_cache table for storing sentiment analysis results
CREATE TABLE IF NOT EXISTS fear_greed_cache (
  id SERIAL PRIMARY KEY,
  cache_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- The three period values
  today_index INTEGER NOT NULL CHECK (today_index >= 0 AND today_index <= 100),
  today_classification TEXT NOT NULL,
  today_classification_de TEXT NOT NULL,
  
  last_3_days_index INTEGER NOT NULL CHECK (last_3_days_index >= 0 AND last_3_days_index <= 100),
  last_3_days_classification TEXT NOT NULL,
  last_3_days_classification_de TEXT NOT NULL,
  
  last_7_days_index INTEGER NOT NULL CHECK (last_7_days_index >= 0 AND last_7_days_index <= 100),
  last_7_days_classification TEXT NOT NULL,
  last_7_days_classification_de TEXT NOT NULL,
  
  -- Trend
  trend TEXT NOT NULL CHECK (trend IN ('rising', 'falling', 'stable')),
  trend_insight TEXT,
  
  -- Full JSON data for drivers, quotes, summary
  full_data JSONB NOT NULL,
  
  -- Metadata
  message_count INTEGER DEFAULT 0,
  unique_users INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Only one entry per date
  CONSTRAINT fear_greed_cache_date_unique UNIQUE (cache_date)
);

-- Index for fast lookups by date
CREATE INDEX IF NOT EXISTS idx_fear_greed_cache_date ON fear_greed_cache(cache_date DESC);

-- Comment
COMMENT ON TABLE fear_greed_cache IS 'Cache for Fear & Greed sentiment analysis results';

