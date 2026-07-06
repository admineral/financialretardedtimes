/**
 * Shared date stats loader for room archive (counts only — no message bodies).
 * Uses date_stats_cache with stale-while-revalidate for fast timeline rendering.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DateStats } from '@/app/newspaper/lib/types'
import { getNewspaperDateKey } from '@/app/newspaper/lib/timezone'

const TODAY_FRESH_MS = 5 * 60 * 1000
const TODAY_STALE_MS = 30 * 60 * 1000

export type DateStatsCacheState = 'fresh' | 'stale' | 'miss'

export interface DateStatsResult {
  dates: DateStats[]
  cumulativeUsers: Record<number, number>
  totalDays: number
  totalMessages: number
  maxDailyMessages: number
  cacheState: DateStatsCacheState
  cacheAgeMs: number | null
}

interface CachedRow {
  dates: DateStats[]
  cumulative_users: Record<number, number>
  total_days: number
  total_messages: number
  updated_at: string
}

export function getDateStatsCacheState(
  updatedAt: string,
  dates: DateStats[],
  forceRefresh: boolean
): DateStatsCacheState {
  if (forceRefresh || !dates?.length) return 'miss'

  const today = getNewspaperDateKey()
  if (dates[0]?.date < today) return 'miss'

  const age = Date.now() - new Date(updatedAt).getTime()
  if (age < TODAY_FRESH_MS) return 'fresh'
  if (age < TODAY_STALE_MS) return 'stale'
  return 'miss'
}

function calculateStats(messages: Array<{ time: string; username: string }>) {
  const dateMap = new Map<string, { count: number; users: Set<string> }>()

  for (const msg of messages) {
    const date = getNewspaperDateKey(new Date(msg.time))
    if (!dateMap.has(date)) {
      dateMap.set(date, { count: 0, users: new Set() })
    }
    const entry = dateMap.get(date)!
    entry.count++
    entry.users.add(msg.username)
  }

  const dates: DateStats[] = Array.from(dateMap.entries())
    .map(([date, stats]) => ({
      date,
      messageCount: stats.count,
      uniqueUsers: stats.users.size
    }))
    .sort((a, b) => b.date.localeCompare(a.date))

  const sortedDates = dates.map(d => d.date)
  const usersByDate = new Map<string, Set<string>>()
  for (const msg of messages) {
    const date = getNewspaperDateKey(new Date(msg.time))
    if (!usersByDate.has(date)) usersByDate.set(date, new Set())
    usersByDate.get(date)!.add(msg.username)
  }

  const cumulativeUsers: Record<number, number> = {}
  for (const range of [1, 3, 7, 30]) {
    const usersInRange = new Set<string>()
    for (const dateKey of sortedDates.slice(0, range)) {
      usersByDate.get(dateKey)?.forEach(u => usersInRange.add(u))
    }
    cumulativeUsers[range] = usersInRange.size
  }

  return { dates, cumulativeUsers, totalMessages: messages.length }
}

async function rebuildDateStatsCache(supabase: SupabaseClient): Promise<DateStatsResult> {
  const allMessages: Array<{ time: string; username: string }> = []
  const pageSize = 1000
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const { data: pageMessages, error } = await supabase
      .from('tv_chat_messages')
      .select('time, username')
      .order('time', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (error) throw new Error(error.message)
    if (!pageMessages?.length) {
      hasMore = false
    } else {
      allMessages.push(...pageMessages)
      offset += pageSize
      hasMore = pageMessages.length === pageSize
    }
  }

  const { dates, cumulativeUsers, totalMessages } = calculateStats(allMessages)

  await supabase.from('date_stats_cache').upsert(
    {
      cache_key: 'date_stats',
      dates,
      cumulative_users: cumulativeUsers,
      total_days: dates.length,
      total_messages: totalMessages,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'cache_key' }
  )

  return {
    dates,
    cumulativeUsers,
    totalDays: dates.length,
    totalMessages,
    maxDailyMessages: dates.reduce((max, d) => Math.max(max, d.messageCount), 0),
    cacheState: 'fresh',
    cacheAgeMs: 0
  }
}

export async function loadDateStats(
  supabase: SupabaseClient,
  options: { forceRefresh?: boolean } = {}
): Promise<DateStatsResult> {
  const forceRefresh = options.forceRefresh ?? false

  const { data: cachedData } = await supabase
    .from('date_stats_cache')
    .select('dates, cumulative_users, total_days, total_messages, updated_at')
    .eq('cache_key', 'date_stats')
    .maybeSingle()

  const cached = cachedData as CachedRow | null
  const cacheState = cached
    ? getDateStatsCacheState(cached.updated_at, cached.dates, forceRefresh)
    : 'miss'

  if (cacheState === 'fresh' || cacheState === 'stale') {
    return {
      dates: cached!.dates,
      cumulativeUsers: cached!.cumulative_users || {},
      totalDays: cached!.total_days,
      totalMessages: cached!.total_messages,
      maxDailyMessages: cached!.dates.reduce(
        (max: number, d: DateStats) => Math.max(max, d.messageCount),
        0
      ),
      cacheState,
      cacheAgeMs: Date.now() - new Date(cached!.updated_at).getTime()
    }
  }

  return rebuildDateStatsCache(supabase)
}

export function jsonCacheHeaders(cacheState: DateStatsCacheState): HeadersInit {
  if (cacheState === 'fresh') {
    return { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' }
  }
  if (cacheState === 'stale') {
    return { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300' }
  }
  return { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
}
