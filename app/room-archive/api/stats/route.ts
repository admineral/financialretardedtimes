/**
 * Room Archive Stats API
 *
 * Combines date statistics with cron sync status for the archive explorer.
 * ENDPOINT: GET /room-archive/api/stats
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getNewspaperDateKey } from '@/app/newspaper/lib/timezone'
import type { DateStats } from '@/app/newspaper/lib/types'

const DEFAULT_ROOM = 'bitcoin_de_DE'

export async function GET(request: NextRequest) {
  await headers()

  const roomId = request.nextUrl.searchParams.get('room') || DEFAULT_ROOM
  const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true'

  try {
    const supabase = await createClient()

    // Reuse date_stats_cache when valid
    let dates: DateStats[] = []
    let totalMessages = 0
    let totalDays = 0
    let cumulativeUsers: Record<number, number> = {}
    let isFromCache = false

    if (!forceRefresh) {
      const { data: cachedData } = await supabase
        .from('date_stats_cache')
        .select('dates, cumulative_users, total_days, total_messages, updated_at')
        .eq('cache_key', 'date_stats')
        .single()

      if (cachedData?.dates?.length) {
        const today = getNewspaperDateKey()
        const cacheAge = Date.now() - new Date(cachedData.updated_at).getTime()
        const isFresh = cachedData.dates[0]?.date >= today && cacheAge < 5 * 60 * 1000

        if (isFresh) {
          dates = cachedData.dates
          totalMessages = cachedData.total_messages
          totalDays = cachedData.total_days
          cumulativeUsers = cachedData.cumulative_users || {}
          isFromCache = true
        }
      }
    }

    if (!isFromCache) {
      const allMessages: Array<{ time: string; username: string }> = []
      const pageSize = 1000
      let offset = 0
      let hasMore = true

      while (hasMore) {
        const { data: pageMessages, error: pageError } = await supabase
          .from('tv_chat_messages')
          .select('time, username')
          .order('time', { ascending: false })
          .range(offset, offset + pageSize - 1)

        if (pageError) throw new Error(pageError.message)
        if (!pageMessages || pageMessages.length === 0) {
          hasMore = false
        } else {
          allMessages.push(...pageMessages)
          offset += pageSize
          hasMore = pageMessages.length === pageSize
        }
      }

      const dateMap = new Map<string, { count: number; users: Set<string> }>()
      for (const msg of allMessages) {
        const dateKey = getNewspaperDateKey(new Date(msg.time))
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, { count: 0, users: new Set() })
        }
        const entry = dateMap.get(dateKey)!
        entry.count++
        entry.users.add(msg.username)
      }

      dates = Array.from(dateMap.entries())
        .map(([dateKey, stats]) => ({
          date: dateKey,
          messageCount: stats.count,
          uniqueUsers: stats.users.size
        }))
        .sort((a, b) => b.date.localeCompare(a.date))

      totalMessages = allMessages.length
      totalDays = dates.length

      const sortedDateKeys = dates.map(d => d.date)
      cumulativeUsers = {}
      for (const range of [1, 3, 7]) {
        const usersInRange = new Set<string>()
        for (const dateKey of sortedDateKeys.slice(0, range)) {
          const entry = dateMap.get(dateKey)
          entry?.users.forEach(u => usersInRange.add(u))
        }
        cumulativeUsers[range] = usersInRange.size
      }
    }

    const [{ data: syncStatus }, { data: syncHistory }] = await Promise.all([
      supabase
        .from('tv_chat_sync_status')
        .select('*')
        .eq('room_id', roomId)
        .maybeSingle(),
      supabase
        .from('tv_sync_history')
        .select('id, started_at, completed_at, success, messages_inserted, trigger_type, error_message')
        .eq('room_id', roomId)
        .order('started_at', { ascending: false })
        .limit(5)
    ])

    const maxCount = dates.reduce((max, d) => Math.max(max, d.messageCount), 0)

    return Response.json({
      roomId,
      dates,
      totalMessages,
      totalDays,
      cumulativeUsers,
      maxDailyMessages: maxCount,
      isFromCache,
      syncStatus: syncStatus || null,
      syncHistory: syncHistory || [],
      oldestDate: dates.length > 0 ? dates[dates.length - 1].date : null,
      newestDate: dates.length > 0 ? dates[0].date : null
    })
  } catch (error) {
    console.error('[ROOM ARCHIVE STATS]', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
