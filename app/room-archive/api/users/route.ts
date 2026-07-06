/**
 * Room Archive Users API — SQL aggregation via RPC (fast GROUP BY).
 * ENDPOINT: GET /room-archive/api/users?date=YYYY-MM-DD&limit=30
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getNewspaperDayBounds } from '@/app/newspaper/lib/timezone'
import { getRangeBounds, type UserRange } from '../../lib/range-utils'

const DEFAULT_ROOM = 'bitcoin_de_DE'
const USERS_CACHE_MS = 10 * 60 * 1000

export async function GET(request: NextRequest) {
  await headers()

  const { searchParams } = request.nextUrl
  const date = searchParams.get('date')
  const range = (searchParams.get('range') || (date ? 'day' : 'all')) as UserRange
  const roomId = searchParams.get('room') || DEFAULT_ROOM
  const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100)
  const forceRefresh = searchParams.get('refresh') === 'true'

  try {
    const supabase = await createClient()
    const cacheKey = `${roomId}:${range}:${date || ''}:${limit}`

    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('room_archive_activity_cache')
        .select('payload, updated_at')
        .eq('cache_key', `users:${cacheKey}`)
        .maybeSingle()

      if (cached?.payload && Date.now() - new Date(cached.updated_at).getTime() < USERS_CACHE_MS) {
        return Response.json(cached.payload, {
          headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' }
        })
      }
    }

    const bounds = getRangeBounds(range, date)
    const { startDate } = getNewspaperDayBounds(bounds.from)
    const { endDate } = getNewspaperDayBounds(bounds.to)
    const fromIso = startDate.toISOString()
    const toIso = endDate.toISOString()

    const { data: rpcUsers, error: rpcError } = await supabase.rpc('get_room_top_chatters', {
      p_room_id: roomId,
      p_from: fromIso,
      p_to: toIso,
      p_limit: limit
    })

    if (rpcError) {
      console.warn('[ROOM ARCHIVE USERS] RPC unavailable, falling back:', rpcError.message)
      return fallbackUsersQuery(supabase, roomId, bounds.from, bounds.to, limit)
    }

    const users = (rpcUsers || []).map(
      (row: {
        username: string
        message_count: number
        user_pic: string | null
        is_moderator: boolean
      }) => ({
        username: row.username,
        messageCount: Number(row.message_count),
        user_pic: row.user_pic || undefined,
        is_moderator: row.is_moderator || false
      })
    )

    const payload = {
      date: range === 'day' ? date : null,
      range,
      from: bounds.from,
      to: bounds.to,
      roomId,
      users,
      totalUniqueUsers: users.length,
      source: 'rpc'
    }

    await supabase.from('room_archive_activity_cache').upsert(
      {
        cache_key: `users:${cacheKey}`,
        room_id: roomId,
        from_date: bounds.from,
        to_date: bounds.to,
        mode: 'daily',
        payload,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'cache_key' }
    )

    return Response.json(payload, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' }
    })
  } catch (error) {
    console.error('[ROOM ARCHIVE USERS]', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

async function fallbackUsersQuery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roomId: string,
  fromDate: string,
  toDate: string,
  limit: number
) {
  const { startDate } = getNewspaperDayBounds(fromDate)
  const { endDate } = getNewspaperDayBounds(toDate)
  const userMap = new Map<string, { count: number; user_pic?: string; is_moderator: boolean }>()
  const pageSize = 1000
  let offset = 0
  let hasMore = true

  while (hasMore) {
    let query = supabase
      .from('tv_chat_messages')
      .select('username, user_pic, is_moderator')
      .eq('room_id', roomId)
      .gte('time', startDate.toISOString())
      .lte('time', endDate.toISOString())
      .order('time', { ascending: false })

    const { data: page, error } = await query.range(offset, offset + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!page?.length) break

    for (const msg of page) {
      const existing = userMap.get(msg.username)
      if (existing) {
        existing.count++
        if (msg.user_pic) existing.user_pic = msg.user_pic
        if (msg.is_moderator) existing.is_moderator = true
      } else {
        userMap.set(msg.username, {
          count: 1,
          user_pic: msg.user_pic || undefined,
          is_moderator: msg.is_moderator || false
        })
      }
    }

    offset += pageSize
    hasMore = page.length === pageSize
  }

  const users = Array.from(userMap.entries())
    .map(([username, data]) => ({
      username,
      messageCount: data.count,
      user_pic: data.user_pic,
      is_moderator: data.is_moderator
    }))
    .sort((a, b) => b.messageCount - a.messageCount)
    .slice(0, limit)

  return Response.json({
    range: fromDate === toDate ? 'day' : 'custom',
    from: fromDate,
    to: toDate,
    roomId,
    users,
    totalUniqueUsers: userMap.size,
    source: 'fallback'
  })
}
