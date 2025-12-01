-- TradingView Chat Links and Quotes Tables
-- Extracts and stores links and quote relationships from chat messages

-- ============================================
-- 1. tv_chat_links - Extracted Links from Messages
-- ============================================
CREATE TABLE IF NOT EXISTS tv_chat_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  username TEXT NOT NULL,
  url TEXT NOT NULL,
  domain TEXT,  -- Extracted domain for easy filtering
  link_type TEXT,  -- 'tradingview', 'twitter', 'youtube', 'image', 'other'
  message_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, message_id, url)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_links_room_time ON tv_chat_links(room_id, message_time DESC);
CREATE INDEX IF NOT EXISTS idx_links_username ON tv_chat_links(username);
CREATE INDEX IF NOT EXISTS idx_links_domain ON tv_chat_links(domain);
CREATE INDEX IF NOT EXISTS idx_links_type ON tv_chat_links(link_type);

-- Enable RLS
ALTER TABLE tv_chat_links ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read links
CREATE POLICY "Anyone can read links" ON tv_chat_links
  FOR SELECT USING (true);

-- Allow service role to insert
CREATE POLICY "Service can insert links" ON tv_chat_links
  FOR INSERT WITH CHECK (true);

-- ============================================
-- 2. tv_chat_quotes - Quote Relationships
-- ============================================
CREATE TABLE IF NOT EXISTS tv_chat_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL,
  message_id TEXT NOT NULL,  -- The message containing the quote
  quoter_username TEXT NOT NULL,  -- Who is quoting
  quoted_username TEXT NOT NULL,  -- Who is being quoted
  quoted_text TEXT,  -- The text being quoted (truncated)
  message_time TIMESTAMPTZ NOT NULL,  -- When the quote was made
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, message_id, quoted_username)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_quotes_room_time ON tv_chat_quotes(room_id, message_time DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_quoter ON tv_chat_quotes(quoter_username);
CREATE INDEX IF NOT EXISTS idx_quotes_quoted ON tv_chat_quotes(quoted_username);

-- Enable RLS
ALTER TABLE tv_chat_quotes ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read quotes
CREATE POLICY "Anyone can read quotes" ON tv_chat_quotes
  FOR SELECT USING (true);

-- Allow service role to insert
CREATE POLICY "Service can insert quotes" ON tv_chat_quotes
  FOR INSERT WITH CHECK (true);

-- ============================================
-- 3. Update sync_status to track initial fetch
-- ============================================
-- Add column to track if initial full fetch has been done
-- (This column may already exist, so we use IF NOT EXISTS pattern)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tv_chat_sync_status' 
    AND column_name = 'initial_fetch_done'
  ) THEN
    ALTER TABLE tv_chat_sync_status ADD COLUMN initial_fetch_done BOOLEAN DEFAULT FALSE;
  END IF;
END $$;


