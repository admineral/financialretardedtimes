-- Sync History Table - Logs each cron sync run
CREATE TABLE IF NOT EXISTS tv_sync_history (
  id SERIAL PRIMARY KEY,
  room_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  success BOOLEAN NOT NULL DEFAULT false,
  messages_fetched INTEGER NOT NULL DEFAULT 0,
  messages_inserted INTEGER NOT NULL DEFAULT 0,
  duplicates_skipped INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'cron', -- 'cron' or 'manual'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_sync_history_room_id ON tv_sync_history(room_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_started_at ON tv_sync_history(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_history_room_started ON tv_sync_history(room_id, started_at DESC);

-- Enable RLS
ALTER TABLE tv_sync_history ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Anyone can read sync history" ON tv_sync_history;
DROP POLICY IF EXISTS "Service can insert sync history" ON tv_sync_history;
DROP POLICY IF EXISTS "Service can update sync history" ON tv_sync_history;

CREATE POLICY "Anyone can read sync history" ON tv_sync_history
  FOR SELECT USING (true);

CREATE POLICY "Service can insert sync history" ON tv_sync_history
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update sync history" ON tv_sync_history
  FOR UPDATE USING (true);

