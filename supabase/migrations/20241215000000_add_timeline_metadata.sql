-- Add metadata column to chat_timeline_cache
-- Stores additional info like mode, messageCount, uniqueUsers, summary, activityLevel

ALTER TABLE chat_timeline_cache 
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Comment
COMMENT ON COLUMN chat_timeline_cache.metadata IS 'Additional cache metadata: mode, messageCount, uniqueUsers, summary, activityLevel, dominantSentiment';

