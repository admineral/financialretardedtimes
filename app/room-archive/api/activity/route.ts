/**
 * Room Archive Activity API
 *
 * Daily ranges: instant from date_stats counts (?source=counts or auto).
 * Hourly (≤7 days): cached message scan.
 * ENDPOINT: GET /room-archive/api/activity?from=&to=
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import {
  getNewspaperDayBounds,
  getNewspaperDateKey,
  NEWSPAPER_TIME_ZONE
} from '@/app/newspaper/lib/timezone'
import { loadDateStats } from '../../lib/date-stats'
import {
  buildDailyActivityFromStats,
  shouldUseCountsOnlyActivity
} from '../../lib/activity-from-stats'

const DEFAULT_ROOM = 'bitcoin_de_DE'
const HOURLY_CACHE_MS = 10 * 60 * 1000

interface ActivityBucket {
  hour: number
  label: string
  count: number
  uniqueUsers: number
  intensity: number
}

export async function GET(request: NextRequest) {
  await headers()

  const { searchParams } = request.nextUrl
  const roomId = searchParams.get('room') || DEFAULT_ROOM
  const forceRefresh = searchParams.get('refresh') === 'true'
  const singleDate = searchParams.get('date')
  const fromDate = searchParams.get('from') || singleDate
  const toDate = searchParams.get('to') || singleDate

  if (!fromDate || !toDate) {
    return Response.json({ error: 'from and to date required (YYYY-MM-DD)' }, { status: 400 })
  }

  const rangeStart = fromDate <= toDate ? fromDate : toDate
  const rangeEnd = fromDate <= toDate ? toDate : fromDate
  const dayCount = countDaysInclusive(rangeStart, rangeEnd)

  try {
    const supabase = await createClient()

    if (shouldUseCountsOnlyActivity(dayCount)) {
      const stats = await loadDateStats(supabase, { forceRefresh: false })
      const rangeDates = stats.dates.filter(
        d => d.date >= rangeStart && d.date <= rangeEnd
      )
      const result = buildDailyActivityFromStats(rangeDates)
      if (!result) {
        return Response.json({ error: 'No data in range' }, { status: 404 })
      }

      return Response.json(
        { roomId, ...result, isFromCache: true, cacheState: stats.cacheState },
        { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
      )
    }

    const cacheKey = `${roomId}:${rangeStart}:${rangeEnd}:hourly`

    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('room_archive_activity_cache')
        .select('payload, updated_at')
        .eq('cache_key', cacheKey)
        .maybeSingle()

      if (cached?.payload && isHourlyCacheFresh(cached.updated_at)) {
        return Response.json(
          {
            ...(cached.payload as Record<string, unknown>),
            isFromCache: true,
            cacheState: 'fresh'
          },
          { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } }
        )
      }
    }

    const { startDate } = getNewspaperDayBounds(rangeStart)
    const { endDate } = getNewspaperDayBounds(rangeEnd)
    const buckets = buildHourlyBuckets()
    const userSets: Set<string>[] = buckets.map(() => new Set())

    const pageSize = 1000
    let offset = 0
    let hasMore = true
    let totalMessages = 0

    while (hasMore) {
      const { data: page, error } = await supabase
        .from('tv_chat_messages')
        .select('time, username')
        .eq('room_id', roomId)
        .gte('time', startDate.toISOString())
        .lte('time', endDate.toISOString())
        .order('time', { ascending: true })
        .range(offset, offset + pageSize - 1)

      if (error) throw new Error(error.message)
      if (!page?.length) {
        hasMore = false
        break
      }

      for (const msg of page) {
        totalMessages++
        const hour = getBerlinHour(msg.time)
        if (hour >= 0 && hour < 24) {
          buckets[hour].count++
          userSets[hour].add(msg.username)
        }
      }

      offset += pageSize
      hasMore = page.length === pageSize
    }

    const enrichedBuckets = buckets.map((bucket, index) => ({
      ...bucket,
      uniqueUsers: userSets[index].size,
      intensity: 0
    }))

    const maxCount = Math.max(...enrichedBuckets.map(b => b.count), 1)
    for (const bucket of enrichedBuckets) {
      bucket.intensity = bucket.count / maxCount
    }

    const peakBucket = enrichedBuckets.reduce(
      (peak, bucket) => (bucket.count > peak.count ? bucket : peak),
      enrichedBuckets[0]
    )

    const payload = {
      from: rangeStart,
      to: rangeEnd,
      roomId,
      mode: 'hourly' as const,
      dayCount,
      buckets: enrichedBuckets,
      totalMessages,
      peakIndex: peakBucket.hour,
      peakLabel: peakBucket.label,
      peakCount: peakBucket.count,
      source: 'messages' as const
    }

    await supabase.from('room_archive_activity_cache').upsert(
      {
        cache_key: cacheKey,
        room_id: roomId,
        from_date: rangeStart,
        to_date: rangeEnd,
        mode: 'hourly',
        payload,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'cache_key' }
    )

    return Response.json(
      { ...payload, isFromCache: false, cacheState: 'miss' },
      { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' } }
    )
  } catch (error) {
    console.error('[ROOM ARCHIVE ACTIVITY]', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

function isHourlyCacheFresh(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() < HOURLY_CACHE_MS
}

function buildHourlyBuckets(): ActivityBucket[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    count: 0,
    uniqueUsers: 0,
    intensity: 0
  }))
}

function countDaysInclusive(from: string, to: string): number {
  const start = new Date(`${from}T12:00:00`)
  const end = new Date(`${to}T12:00:00`)
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
}

function getBerlinHour(isoTime: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NEWSPAPER_TIME_ZONE,
    hour: 'numeric',
    hour12: false
  }).formatToParts(new Date(isoTime))

  const hourPart = parts.find(p => p.type === 'hour')
  return hourPart ? parseInt(hourPart.value, 10) : 0
}
