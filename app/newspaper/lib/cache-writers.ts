import { createClient } from '@/lib/supabase/server'
import type {
  DailyFearGreedData,
  DailyTickerEventData,
  DailyTimelineEventData,
  UnifiedNewspaperData
} from './types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type TickerCacheEvent = DailyTickerEventData & { id: string }

export interface TimelineCachePayload {
  events: DailyTimelineEventData[]
  summary: string | null
  activityLevel: 'low' | 'medium' | 'high' | null
  dominantSentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed' | null
}

export interface FearGreedDateRangeInfo {
  oldestDate: string
  newestDate: string
  todayMessageCount: number
}

export async function writeNewspaperCache(
  supabase: SupabaseServerClient,
  date: string,
  dayRange: number,
  data: UnifiedNewspaperData,
  messageCount: number,
  uniqueUsers: number
): Promise<void> {
  const { error } = await supabase
    .from('newspaper_cache')
    .upsert({
      cache_date: date,
      day_range: dayRange,
      data,
      message_count: messageCount,
      unique_users: uniqueUsers,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'cache_date,day_range'
    })

  if (!error) return

  if (error.code === '42703' || error.message?.includes('day_range')) {
    const { error: fallbackError } = await supabase
      .from('newspaper_cache')
      .upsert({
        cache_date: date,
        data,
        message_count: messageCount,
        unique_users: uniqueUsers,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'cache_date'
      })

    if (fallbackError) {
      console.error('[DAILY-AI] Failed legacy newspaper cache write:', fallbackError.message)
    }
    return
  }

  console.error('[DAILY-AI] Failed newspaper cache write:', error.message)
}

export async function writeTickerCache(
  supabase: SupabaseServerClient,
  events: TickerCacheEvent[],
  startDate: Date,
  endDate: Date,
  messageCount: number,
  uniqueUsers: number
): Promise<void> {
  const { error } = await supabase
    .from('chat_timeline_cache')
    .upsert({
      cache_key: 'ticker-24h',
      events,
      event_count: events.length,
      date_range_start: startDate.toISOString().split('T')[0],
      date_range_end: endDate.toISOString().split('T')[0],
      updated_at: new Date().toISOString(),
      metadata: {
        messageCount,
        uniqueUsers
      }
    }, {
      onConflict: 'cache_key'
    })

  if (error) {
    console.error('[DAILY-AI] Failed ticker cache write:', error.message)
  }
}

export async function writeTimelineCache(
  supabase: SupabaseServerClient,
  mode: string,
  payload: TimelineCachePayload,
  startDate: Date,
  endDate: Date,
  messageCount: number,
  uniqueUsers: number
): Promise<void> {
  const { error } = await supabase
    .from('chat_timeline_cache')
    .upsert({
      cache_key: `timeline-${mode}`,
      events: payload.events,
      event_count: payload.events.length,
      date_range_start: startDate.toISOString().split('T')[0],
      date_range_end: endDate.toISOString().split('T')[0],
      updated_at: new Date().toISOString(),
      metadata: {
        mode,
        messageCount,
        uniqueUsers,
        summary: payload.summary,
        activityLevel: payload.activityLevel,
        dominantSentiment: payload.dominantSentiment
      }
    }, {
      onConflict: 'cache_key'
    })

  if (error) {
    console.error('[DAILY-AI] Failed timeline cache write:', error.message)
  }
}

export async function writeFearGreedCache(
  supabase: SupabaseServerClient,
  data: DailyFearGreedData,
  messageCount: number,
  uniqueUsers: number,
  dateRangeInfo: FearGreedDateRangeInfo
): Promise<void> {
  const cacheDate = new Date().toISOString().split('T')[0]

  const cachePromise = supabase
    .from('fear_greed_cache')
    .upsert({
      cache_date: cacheDate,
      today_index: data.today.index,
      today_classification: data.today.classification,
      today_classification_de: data.today.classificationDE,
      last_3_days_index: data.last3Days.index,
      last_3_days_classification: data.last3Days.classification,
      last_3_days_classification_de: data.last3Days.classificationDE,
      last_7_days_index: data.last7Days.index,
      last_7_days_classification: data.last7Days.classification,
      last_7_days_classification_de: data.last7Days.classificationDE,
      trend: data.trend,
      insight: data.insight,
      top_drivers: data.topDrivers,
      full_data: {
        insight: data.insight,
        topDrivers: data.topDrivers,
        dateRange: dateRangeInfo
      },
      message_count: messageCount,
      unique_users: uniqueUsers,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'cache_date'
    })

  const historyPromise = supabase
    .from('fear_greed_history')
    .insert({
      analysis_date: cacheDate,
      today_index: data.today.index,
      today_classification: data.today.classification,
      today_classification_de: data.today.classificationDE,
      last_3_days_index: data.last3Days.index,
      last_3_days_classification: data.last3Days.classification,
      last_3_days_classification_de: data.last3Days.classificationDE,
      last_7_days_index: data.last7Days.index,
      last_7_days_classification: data.last7Days.classification,
      last_7_days_classification_de: data.last7Days.classificationDE,
      trend: data.trend,
      insight: data.insight,
      top_drivers: data.topDrivers,
      message_count: messageCount,
      unique_users: uniqueUsers,
      oldest_message_date: dateRangeInfo.oldestDate,
      newest_message_date: dateRangeInfo.newestDate
    })

  const [cacheResult, historyResult] = await Promise.all([cachePromise, historyPromise])

  if (cacheResult.error) {
    console.error('[DAILY-AI] Failed fear/greed cache write:', cacheResult.error.message)
  }

  if (historyResult.error) {
    console.error('[DAILY-AI] Failed fear/greed history write:', historyResult.error.message)
  }
}
