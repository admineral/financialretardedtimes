-- Daily quotes cache for chart-timeline
-- Each day is cached separately, old days are permanent, today refreshes after 4h

CREATE TABLE IF NOT EXISTS chart_timeline_daily_quotes (
  date DATE PRIMARY KEY,                    -- The day (YYYY-MM-DD)
  quotes JSONB NOT NULL DEFAULT '[]',       -- Array of quotes for this day
  quote_count INTEGER NOT NULL DEFAULT 0,   -- Number of quotes
  message_count INTEGER NOT NULL DEFAULT 0, -- Messages analyzed
  price_high DECIMAL,                       -- Day's high price
  price_low DECIMAL,                        -- Day's low price  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast date range queries
CREATE INDEX IF NOT EXISTS idx_daily_quotes_date ON chart_timeline_daily_quotes(date DESC);

-- Comment
COMMENT ON TABLE chart_timeline_daily_quotes IS 'Daily cache for chart-timeline quotes. Old days cached permanently, today refreshes every 4h.';

