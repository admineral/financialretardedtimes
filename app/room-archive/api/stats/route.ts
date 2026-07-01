/**
 * Room Archive Stats API — timeline counts only (fast path via date_stats_cache).
 * ENDPOINT: GET /room-archive/api/stats
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { jsonCacheHeaders, loadDateStats } from '../../lib/date-stats'

const DEFAULT_ROOM = 'bitcoin_de_DE'

export async function GET(request: NextRequest) {
  await headers()

  const roomId = request.nextUrl.searchParams.get('room') || DEFAULT_ROOM
  const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true'

  try {
    const supabase = await createClient()
    const stats = await loadDateStats(supabase, { forceRefresh })

    const { data: syncStatus } = await supabase
      .from('tv_chat_sync_status')
      .select('room_id, last_sync_at, total_messages, is_full_history, newest_message_time')
      .eq('room_id', roomId)
      .maybeSingle()

    const body = {
      roomId,
      dates: stats.dates,
      totalMessages: stats.totalMessages,
      totalDays: stats.totalDays,
      cumulativeUsers: stats.cumulativeUsers,
      maxDailyMessages: stats.maxDailyMessages,
      isFromCache: stats.cacheState !== 'miss',
      cacheState: stats.cacheState,
      cacheAgeMs: stats.cacheAgeMs,
      syncStatus: syncStatus || null,
      oldestDate: stats.dates.length > 0 ? stats.dates[stats.dates.length - 1].date : null,
      newestDate: stats.dates.length > 0 ? stats.dates[0].date : null
    }

    return Response.json(body, { headers: jsonCacheHeaders(stats.cacheState) })
  } catch (error) {
    console.error('[ROOM ARCHIVE STATS]', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
