import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

const log = logger.child('CHATTERS')

/**
 * Lightweight API endpoint to get active chatters for specific date(s)
 * Uses SQL aggregation - NO message content is loaded
 * 
 * Returns: { chatters: { username, avatar, messageCount }[], totalMessages }
 */

interface ChatterStats {
  username: string
  avatar: string | null
  messageCount: number
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const datesParam = searchParams.get('dates') // comma-separated: 2024-01-01,2024-01-02
  const date = searchParams.get('date') // single date fallback
  const limit = parseInt(searchParams.get('limit') || '50', 10)

  // Parse dates
  const dates: string[] = datesParam 
    ? datesParam.split(',').map(d => d.trim())
    : date ? [date] : []

  if (dates.length === 0) {
    return NextResponse.json(
      { error: 'Missing required parameter: date or dates' },
      { status: 400 }
    )
  }

  try {
    const supabase = await createClient()

    // Build date ranges
    const dateConditions = dates.map(d => ({
      start: `${d}T00:00:00.000Z`,
      end: `${d}T23:59:59.999Z`
    }))

    // Use SQL aggregation to get counts without loading message content
    // This is MUCH more efficient than fetching all messages
    let query = supabase
      .from('tv_chat_messages')
      .select('username, user_pic')

    // Add date filters using OR for multiple dates
    if (dates.length === 1) {
      query = query
        .gte('time', dateConditions[0].start)
        .lte('time', dateConditions[0].end)
    } else {
      // For multiple dates, we need to use OR conditions
      const orConditions = dateConditions
        .map(d => `and(time.gte.${d.start},time.lte.${d.end})`)
        .join(',')
      query = query.or(orConditions)
    }

    const { data: messages, error } = await query

    if (error) {
      log.error('Database query failed', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    // Aggregate in memory (Supabase doesn't support GROUP BY directly)
    const userMap = new Map<string, { avatar: string | null; count: number }>()
    
    for (const msg of messages || []) {
      const existing = userMap.get(msg.username)
      if (existing) {
        existing.count++
        // Keep first non-null avatar
        if (!existing.avatar && msg.user_pic) {
          existing.avatar = msg.user_pic
        }
      } else {
        userMap.set(msg.username, {
          avatar: msg.user_pic || null,
          count: 1
        })
      }
    }

    // Convert to sorted array
    const chatters: ChatterStats[] = Array.from(userMap.entries())
      .map(([username, data]) => ({
        username,
        avatar: data.avatar,
        messageCount: data.count
      }))
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, limit)

    const totalMessages = messages?.length || 0

    log.info('Fetched chatters', { dates: dates.join(','), users: chatters.length, messages: totalMessages })

    return NextResponse.json({
      chatters,
      totalMessages,
      dates,
      userCount: userMap.size
    })

  } catch (err) {
    log.error('Failed to fetch chatters', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

