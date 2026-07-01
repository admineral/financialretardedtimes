/**
 * Room Archive Activity API
 *
 * Hourly message buckets for a single day.
 * ENDPOINT: GET /room-archive/api/activity?date=YYYY-MM-DD
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getNewspaperDayBounds, NEWSPAPER_TIME_ZONE } from '@/app/newspaper/lib/timezone'

const DEFAULT_ROOM = 'bitcoin_de_DE'

export async function GET(request: NextRequest) {
  await headers()

  const date = request.nextUrl.searchParams.get('date')
  const roomId = request.nextUrl.searchParams.get('room') || DEFAULT_ROOM

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'date parameter required (YYYY-MM-DD)' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const { startDate, endDate } = getNewspaperDayBounds(date)

    const buckets = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      count: 0,
      uniqueUsers: 0 as number
    }))

    const userSets: Set<string>[] = Array.from({ length: 24 }, () => new Set())

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
        const hour = getBerlinHour(msg.time)
        if (hour >= 0 && hour < 24) {
          buckets[hour].count++
          userSets[hour].add(msg.username)
        }
      }

      offset += pageSize
      hasMore = page.length === pageSize
    }

    const enrichedBuckets = buckets.map((b, i) => ({
      ...b,
      uniqueUsers: userSets[i].size,
      intensity: 0
    }))

    const maxCount = Math.max(...enrichedBuckets.map(b => b.count), 1)
    for (const bucket of enrichedBuckets) {
      bucket.intensity = bucket.count / maxCount
    }

    const peakBucket = enrichedBuckets.reduce(
      (peak, b) => (b.count > peak.count ? b : peak),
      enrichedBuckets[0]
    )

    return Response.json({
      date,
      roomId,
      buckets: enrichedBuckets,
      totalMessages,
      peakHour: peakBucket.hour,
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

function getBerlinHour(isoTime: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NEWSPAPER_TIME_ZONE,
    hour: 'numeric',
    hour12: false
  }).formatToParts(new Date(isoTime))

  const hourPart = parts.find(p => p.type === 'hour')
  return hourPart ? parseInt(hourPart.value, 10) : 0
}
