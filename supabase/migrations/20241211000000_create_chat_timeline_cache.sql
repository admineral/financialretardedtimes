-- Create chat timeline cache table
-- Stores pre-generated timeline events for quick retrieval

CREATE TABLE IF NOT EXISTS chat_timeline_cache (
  id SERIAL PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL DEFAULT 'main', -- Allow multiple timeline versions
  events JSONB NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0,
  date_range_start DATE,
  date_range_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_chat_timeline_cache_key ON chat_timeline_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_chat_timeline_cache_updated ON chat_timeline_cache(updated_at);

-- Comment
COMMENT ON TABLE chat_timeline_cache IS 'Stores pre-generated chat timeline events extracted from newspaper cache';

