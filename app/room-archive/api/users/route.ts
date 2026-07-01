/**
 * Room Archive Users API
 *
 * Top chatters for a day or overall archive.
 * ENDPOINT: GET /room-archive/api/users?date=YYYY-MM-DD&limit=30
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getNewspaperDayBounds } from '@/app/newspaper/lib/timezone'

const DEFAULT_ROOM = 'bitcoin_de_DE'

export async function GET(request: NextRequest) {
  await headers()

  const { searchParams } = request.nextUrl
  const date = searchParams.get('date')
  const roomId = searchParams.get('room') || DEFAULT_ROOM
  const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100)

  try {
    const supabase = await createClient()

    const userMap = new Map<string, { count: number; user_pic?: string; is_moderator: boolean }>()
    const pageSize = 1000
    let offset = 0
    let hasMore = true

    while (hasMore) {
      let query = supabase
        .from('tv_chat_messages')
        .select('username, user_pic, is_moderator')
        .eq('room_id', roomId)
        .order('time', { ascending: false })

      if (date) {
        const { startDate, endDate } = getNewspaperDayBounds(date)
        query = query
          .gte('time', startDate.toISOString())
          .lte('time', endDate.toISOString())
      }

      const { data: page, error } = await query.range(offset, offset + pageSize - 1)

      if (error) throw new Error(error.message)
      if (!page || page.length === 0) {
        hasMore = false
        break
      }

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
      date: date || null,
      roomId,
      users,
      totalUniqueUsers: userMap.size
    })
  } catch (error) {
    console.error('[ROOM ARCHIVE USERS]', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
