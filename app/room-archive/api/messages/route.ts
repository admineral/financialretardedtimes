/**
 * Room Archive Messages API
 *
 * Paginated messages for a single day (Berlin timezone).
 * ENDPOINT: GET /room-archive/api/messages?date=YYYY-MM-DD&limit=200&before=ISO&after=ISO
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getNewspaperDayBounds } from '@/app/newspaper/lib/timezone'

const DEFAULT_ROOM = 'bitcoin_de_DE'
const MAX_LIMIT = 500

export async function GET(request: NextRequest) {
  await headers()

  const { searchParams } = request.nextUrl
  const date = searchParams.get('date')
  const roomId = searchParams.get('room') || DEFAULT_ROOM
  const before = searchParams.get('before')
  const after = searchParams.get('after')
  const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), MAX_LIMIT)

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'date parameter required (YYYY-MM-DD)' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const { startDate, endDate } = getNewspaperDayBounds(date)

    const { count: totalCount } = await supabase
      .from('tv_chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .gte('time', startDate.toISOString())
      .lte('time', endDate.toISOString())

    let query = supabase
      .from('tv_chat_messages')
      .select('id, username, text, time, user_pic, is_moderator, badges')
      .eq('room_id', roomId)
      .gte('time', startDate.toISOString())
      .lte('time', endDate.toISOString())

    if (before) {
      query = query
        .lt('time', before)
        .order('time', { ascending: false })
        .limit(limit)
    } else if (after) {
      query = query
        .gt('time', after)
        .order('time', { ascending: true })
        .limit(limit)
    } else {
      query = query
        .order('time', { ascending: false })
        .limit(limit)
    }

    const { data: rawMessages, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    const messages = (rawMessages || [])
      .map(msg => ({
        id: msg.id,
        username: msg.username,
        text: msg.text,
        time: msg.time,
        user_pic: msg.user_pic || undefined,
        is_moderator: msg.is_moderator || false,
        badges: msg.badges || undefined
      }))
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

    const uniqueUsers = new Set(messages.map(m => m.username)).size

    const oldestLoaded = messages[0]?.time
    const hasOlderInDay = oldestLoaded
      ? await hasMessagesBefore(supabase, roomId, startDate.toISOString(), oldestLoaded)
      : (totalCount || 0) > 0

    return Response.json({
      date,
      roomId,
      messages,
      totalCount: totalCount || 0,
      uniqueUsers,
      hasMoreBefore: hasOlderInDay,
      hasMoreAfter: false,
      oldestMessageTime: messages[0]?.time || null,
      newestMessageTime: messages[messages.length - 1]?.time || null
    })
  } catch (error) {
    console.error('[ROOM ARCHIVE MESSAGES]', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

async function hasMessagesBefore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roomId: string,
  dayStart: string,
  beforeTime: string
): Promise<boolean> {
  const { count } = await supabase
    .from('tv_chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .gte('time', dayStart)
    .lt('time', beforeTime)

  return (count || 0) > 0
}
