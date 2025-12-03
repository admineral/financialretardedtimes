/**
 * route.ts (Rate-Chart messages API)
 * 
 * Fetches chat messages from Supabase database for the Rate-Chart.
 * This ensures we get ALL messages, not just what TradingView API returns.
 * 
 * ENDPOINT: GET /Rate-Chart/api/messages?date=YYYY-MM-DD
 * 
 * QUERY PARAMS:
 * - date: string (required) - The date to fetch messages for (YYYY-MM-DD format)
 * 
 * RESPONSE:
 * - success: boolean
 * - messages: ChatMessage[]
 * - count: number
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date')
  
  if (!date) {
    return NextResponse.json({ error: 'Missing date parameter' }, { status: 400 })
  }
  
  try {
    const supabase = await createClient()
    
    // Calculate start and end of day in Vienna time
    // Vienna is UTC+1 (CET) or UTC+2 (CEST in summer)
    // The game runs from 08:00 Vienna to 00:00 Vienna next day
    // We need to fetch a wider range to ensure we get all messages
    // that fall within the Vienna day
    
    // Start: 00:00 Vienna = 23:00 UTC previous day (worst case)
    // End: 23:59 Vienna = 22:59 UTC same day (worst case)
    // To be safe, we fetch from 00:00 UTC to 23:59 UTC of the date
    // AND include messages from the previous day after 22:00 UTC
    // AND include messages from the next day before 01:00 UTC
    
    const prevDate = new Date(date + 'T00:00:00Z')
    prevDate.setDate(prevDate.getDate() - 1)
    const prevDateStr = prevDate.toISOString().split('T')[0]
    
    const nextDate = new Date(date + 'T00:00:00Z')
    nextDate.setDate(nextDate.getDate() + 1)
    const nextDateStr = nextDate.toISOString().split('T')[0]
    
    // Fetch from previous day 22:00 UTC to next day 01:00 UTC
    // This covers all possible Vienna time scenarios
    const startOfRange = `${prevDateStr}T22:00:00.000Z`
    const endOfRange = `${nextDateStr}T01:00:00.000Z`
    
    console.log(`[RATE-CHART MESSAGES] Fetching messages for Vienna date ${date}`)
    console.log(`[RATE-CHART MESSAGES] UTC Range: ${startOfRange} to ${endOfRange}`)
    
    // Paginate to get all messages for the day (Supabase limits to 1000 per request)
    const allMessages: Array<{
      id: string
      username: string
      text: string
      time: string
      user_pic: string | null
      is_moderator: boolean | null
    }> = []
    
    const pageSize = 1000
    let offset = 0
    let hasMore = true
    
    while (hasMore) {
      const { data: pageMessages, error: pageError } = await supabase
        .from('tv_chat_messages')
        .select('id, username, text, time, user_pic, is_moderator')
        .gte('time', startOfRange)
        .lte('time', endOfRange)
        .order('time', { ascending: true })
        .range(offset, offset + pageSize - 1)
      
      if (pageError) {
        console.error('[RATE-CHART MESSAGES] Database error:', pageError)
        throw new Error(`Database error: ${pageError.message}`)
      }
      
      if (!pageMessages || pageMessages.length === 0) {
        hasMore = false
      } else {
        allMessages.push(...pageMessages)
        offset += pageSize
        hasMore = pageMessages.length === pageSize
      }
    }
    
    console.log(`[RATE-CHART MESSAGES] Found ${allMessages.length} messages for ${date}`)
    
    // Transform to ChatMessage format
    const messages = allMessages.map(msg => ({
      id: msg.id,
      username: msg.username,
      text: msg.text,
      time: msg.time,
      user_pic: msg.user_pic || undefined,
      is_moderator: msg.is_moderator || false
    }))
    
    return NextResponse.json({
      success: true,
      messages,
      count: messages.length,
      date
    })
    
  } catch (error) {
    console.error('[RATE-CHART MESSAGES] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        messages: [],
        count: 0
      },
      { status: 500 }
    )
  }
}

