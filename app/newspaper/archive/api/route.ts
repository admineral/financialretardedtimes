/**
 * Archive API Route
 * 
 * Fetches all chat messages from the database, grouped by date.
 * Returns complete message history for debugging and viewing.
 * 
 * ENDPOINT: GET /newspaper/archive/api
 */

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { getNewspaperDateKey } from '../../lib/timezone'

interface Message {
  id: string
  username: string
  text: string
  time: string
  user_pic?: string
  is_moderator?: boolean
}

interface DayGroup {
  date: string
  displayDate: string
  messageCount: number
  uniqueUsers: number
  messages: Message[]
  isExpanded: boolean
}

export async function GET() {
  await headers()
  
  try {
    const supabase = await createClient()
    
    // Fetch ALL messages from the database
    // Note: Supabase has a default 1000 row limit, we need to paginate
    const { count } = await supabase
      .from('tv_chat_messages')
      .select('*', { count: 'exact', head: true })
    
    console.log(`[ARCHIVE API] Total messages in database: ${count}`)
    
    // Paginate to get all messages (Supabase limits to 1000 per request)
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
        .order('time', { ascending: false })
        .range(offset, offset + pageSize - 1)
      
      if (pageError) {
        console.error('[ARCHIVE API] Pagination error:', pageError)
        break
      }
      
      if (!pageMessages || pageMessages.length === 0) {
        hasMore = false
      } else {
        allMessages.push(...pageMessages)
        offset += pageSize
        hasMore = pageMessages.length === pageSize
        console.log(`[ARCHIVE API] Fetched page: ${allMessages.length} messages so far`)
      }
    }
    
    const messages = allMessages
    
    if (!messages || messages.length === 0) {
      return Response.json({
        dayGroups: [],
        totalMessages: 0,
        totalDays: 0
      })
    }
    
    // Group messages by date
    const dateMap = new Map<string, { 
      messages: Message[]
      users: Set<string>
    }>()
    
    for (const msg of messages) {
      const date = getNewspaperDateKey(new Date(msg.time))
      
      if (!dateMap.has(date)) {
        dateMap.set(date, { messages: [], users: new Set() })
      }
      
      const entry = dateMap.get(date)!
      entry.messages.push({
        id: msg.id,
        username: msg.username,
        text: msg.text,
        time: msg.time,
        user_pic: msg.user_pic || undefined,
        is_moderator: msg.is_moderator || false
      })
      entry.users.add(msg.username)
    }
    
    // Convert to array and sort by date (newest first)
    const dayGroups: DayGroup[] = Array.from(dateMap.entries())
      .map(([date, data]) => {
        // Sort messages within each day by time (newest first)
        const sortedMessages = data.messages.sort(
          (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
        )
        
        // Format display date in German
        const dateObj = new Date(date + 'T12:00:00')
        const displayDate = dateObj.toLocaleDateString('de-DE', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
        
        return {
          date,
          displayDate,
          messageCount: data.messages.length,
          uniqueUsers: data.users.size,
          messages: sortedMessages,
          isExpanded: false
        }
      })
      .sort((a, b) => b.date.localeCompare(a.date))
    
    console.log(`[ARCHIVE API] Found ${messages.length} messages across ${dayGroups.length} days`)
    
    return Response.json({
      dayGroups,
      totalMessages: messages.length,
      totalDays: dayGroups.length
    })
    
  } catch (error) {
    console.error('[ARCHIVE API] Error:', error)
    return Response.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      dayGroups: [],
      totalMessages: 0,
      totalDays: 0
    }, { status: 500 })
  }
}
