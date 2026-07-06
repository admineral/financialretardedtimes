/**
 * Room Archive Sync History API
 *
 * Paginated cron sync history for infinite scroll.
 * ENDPOINT: GET /room-archive/api/sync-history?offset=0&limit=20
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

const DEFAULT_ROOM = 'bitcoin_de_DE'
const MAX_LIMIT = 50

export async function GET(request: NextRequest) {
  await headers()

  const { searchParams } = request.nextUrl
  const roomId = searchParams.get('room') || DEFAULT_ROOM
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0)
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), MAX_LIMIT)

  try {
    const supabase = await createClient()

    const { data, error, count } = await supabase
      .from('tv_sync_history')
      .select(
        'id, started_at, completed_at, success, messages_inserted, messages_fetched, duplicates_skipped, trigger_type, error_message',
        { count: 'exact' }
      )
      .eq('room_id', roomId)
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw new Error(error.message)

    const entries = data || []
    const totalCount = count || 0
    const nextOffset = offset + entries.length

    return Response.json({
      roomId,
      entries,
      offset,
      limit,
      totalCount,
      hasMore: nextOffset < totalCount,
      nextOffset
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' }
    })
  } catch (error) {
    console.error('[ROOM ARCHIVE SYNC HISTORY]', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
