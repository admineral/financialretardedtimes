-- Migration: Add data_range column to chart_timeline_analysis_cache
-- Stores info about the date range of messages sent to AI

ALTER TABLE chart_timeline_analysis_cache 
ADD COLUMN IF NOT EXISTS data_range JSONB DEFAULT NULL;

COMMENT ON COLUMN chart_timeline_analysis_cache.data_range IS 'Date range of messages sent to AI: {messagesFrom, messagesTo, messageCount}';

