-- Create fear_greed_history table for storing historical sentiment data
-- Unlike fear_greed_cache (one entry per day), this stores EVERY analysis for tracking over time

CREATE TABLE IF NOT EXISTS fear_greed_history (
  id SERIAL PRIMARY KEY,
  
  -- Timestamp of when this analysis was created
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- The date this analysis is for (can have multiple per day)
  analysis_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
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
  
  -- Insight and drivers
  insight TEXT,
  top_drivers TEXT[],
  
  -- Metadata
  message_count INTEGER DEFAULT 0,
  unique_users INTEGER DEFAULT 0,
  
  -- Date range info (oldest/newest message dates)
  oldest_message_date TEXT,
  newest_message_date TEXT
);

-- Index for fast lookups by date (descending for recent first)
CREATE INDEX IF NOT EXISTS idx_fear_greed_history_created_at ON fear_greed_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fear_greed_history_analysis_date ON fear_greed_history(analysis_date DESC);

-- Enable RLS
ALTER TABLE fear_greed_history ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for charts/widgets)
CREATE POLICY "Allow public read access to fear_greed_history"
  ON fear_greed_history
  FOR SELECT
  TO public
  USING (true);

-- Allow anon and authenticated roles to insert (from API routes)
CREATE POLICY "Allow anon to insert fear_greed_history"
  ON fear_greed_history
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow authenticated to insert fear_greed_history"
  ON fear_greed_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Comment
COMMENT ON TABLE fear_greed_history IS 'Historical Fear & Greed sentiment data for tracking over time and chart visualization';
