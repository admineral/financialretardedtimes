-- Fix RLS policies for chat_timeline_cache table
-- Enable caching for all modes (24h, 3d, 7d)

-- Enable RLS on the table (if not already enabled)
ALTER TABLE chat_timeline_cache ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read access to timeline cache" ON chat_timeline_cache;
DROP POLICY IF EXISTS "Allow public insert access to timeline cache" ON chat_timeline_cache;
DROP POLICY IF EXISTS "Allow public update access to timeline cache" ON chat_timeline_cache;
DROP POLICY IF EXISTS "Allow service role full access to timeline cache" ON chat_timeline_cache;

-- Create policy for public read access (anyone can read cache)
CREATE POLICY "Allow public read access to timeline cache"
ON chat_timeline_cache
FOR SELECT
TO public
USING (true);

-- Create policy for public insert access (API can create new cache entries)
CREATE POLICY "Allow public insert access to timeline cache"
ON chat_timeline_cache
FOR INSERT
TO public
WITH CHECK (true);

-- Create policy for public update access (API can update cache entries)
CREATE POLICY "Allow public update access to timeline cache"
ON chat_timeline_cache
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Create policy for service role (full access)
CREATE POLICY "Allow service role full access to timeline cache"
ON chat_timeline_cache
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Ensure anon role has access
GRANT SELECT, INSERT, UPDATE ON chat_timeline_cache TO anon;
GRANT SELECT, INSERT, UPDATE ON chat_timeline_cache TO authenticated;
GRANT ALL ON chat_timeline_cache TO service_role;

-- Grant sequence access for serial primary key
GRANT USAGE, SELECT ON SEQUENCE chat_timeline_cache_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE chat_timeline_cache_id_seq TO authenticated;
GRANT ALL ON SEQUENCE chat_timeline_cache_id_seq TO service_role;

-- Comment
COMMENT ON TABLE chat_timeline_cache IS 'Stores pre-generated chat timeline events for quick retrieval. Cache keys: timeline-24h, timeline-3d, timeline-7d';

