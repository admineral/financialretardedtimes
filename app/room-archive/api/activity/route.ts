/**
 * Room Archive Activity API
 *
 * Hourly or daily message buckets for a date range.
 * ENDPOINT: GET /room-archive/api/activity?from=YYYY-MM-DD&to=YYYY-MM-DD
 *           GET /room-archive/api/activity?date=YYYY-MM-DD (single day)
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import {
  getNewspaperDayBounds,
  getNewspaperDateKey,
  NEWSPAPER_TIME_ZONE
} from '@/app/newspaper/lib/timezone'

const DEFAULT_ROOM = 'bitcoin_de_DE'
const HOURLY_RANGE_MAX_DAYS = 7

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
  const singleDate = searchParams.get('date')
  const fromDate = searchParams.get('from') || singleDate
  const toDate = searchParams.get('to') || singleDate

  if (!fromDate || !toDate || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return Response.json({ error: 'from and to date required (YYYY-MM-DD)' }, { status: 400 })
  }

  const rangeStart = fromDate <= toDate ? fromDate : toDate
  const rangeEnd = fromDate <= toDate ? toDate : fromDate

  try {
    const supabase = await createClient()
    const { startDate } = getNewspaperDayBounds(rangeStart)
    const { endDate } = getNewspaperDayBounds(rangeEnd)

    const dayCount = countDaysInclusive(rangeStart, rangeEnd)
    const mode = dayCount <= HOURLY_RANGE_MAX_DAYS ? 'hourly' : 'daily'

    const buckets =
      mode === 'hourly'
        ? buildHourlyBuckets()
        : buildDailyBuckets(rangeStart, rangeEnd)

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
      if (!page || page.length === 0) {
        hasMore = false
        break
      }

      for (const msg of page) {
        totalMessages++
        const bucketIndex =
          mode === 'hourly'
            ? getBerlinHour(msg.time)
            : buckets.findIndex(b => b.label === getNewspaperDateKey(new Date(msg.time)))

        if (bucketIndex >= 0 && bucketIndex < buckets.length) {
          buckets[bucketIndex].count++
          userSets[bucketIndex].add(msg.username)
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
      enrichedBuckets[0] || { hour: 0, label: '00:00', count: 0, uniqueUsers: 0, intensity: 0 }
    )

    return Response.json({
      from: rangeStart,
      to: rangeEnd,
      roomId,
      mode,
      dayCount,
      buckets: enrichedBuckets,
      totalMessages,
      peakIndex: peakBucket.hour,
      peakLabel: peakBucket.label,
      peakCount: peakBucket.count
    })
  } catch (error) {
    console.error('[ROOM ARCHIVE ACTIVITY]', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
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

function buildDailyBuckets(from: string, to: string): ActivityBucket[] {
  const buckets: ActivityBucket[] = []
  let index = 0
  const cursor = new Date(`${from}T12:00:00`)
  const end = new Date(`${to}T12:00:00`)

  while (cursor <= end) {
    const dateKey = cursor.toISOString().split('T')[0]
    buckets.push({ hour: index, label: dateKey, count: 0, uniqueUsers: 0, intensity: 0 })
    cursor.setDate(cursor.getDate() + 1)
    index++
  }

  return buckets
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
