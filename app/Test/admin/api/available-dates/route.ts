/**
 * Available Dates API Route
 * 
 * Retrieves all available chat dates with message statistics from the database.
 * 
 * **What it does:**
 * - Fetches all unique dates that have chat messages
 * - Calculates message counts and unique user counts per date
 * - Returns sorted list of dates (newest first) with statistics
 * 
 * **Functions:**
 * - GET: Async handler that queries the database for date statistics
 * 
 * **Returns:**
 * - Success (200): JSON object with:
 *   - `dates`: Array of DateStats objects (date, messageCount, uniqueUsers)
 *   - `totalDays`: Total number of days with messages
 *   - `totalMessages`: Total message count across all days
 * - Error (500): JSON object with error message
 * 
 * **Implementation:**
 * - Primary: Uses Supabase RPC function `get_chat_date_stats` for efficient server-side aggregation
 * - Fallback: If RPC unavailable, fetches all messages and aggregates client-side
 */

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

export interface DateStats {
  date: string // YYYY-MM-DD
  messageCount: number
  uniqueUsers: number
}

export async function GET() {
  await headers()
  
  try {
    const supabase = await createClient()
    
    // Get all unique dates with message counts
    // Using raw SQL for date grouping
    const { data, error } = await supabase
      .rpc('get_chat_date_stats')
    
    if (error) {
      // Fallback: If the function doesn't exist, use a simpler query
      console.log('RPC not available, using fallback query')
      
      const { data: messages, error: msgError } = await supabase
        .from('tv_chat_messages')
        .select('time, username')
        .order('time', { ascending: false })
      
      if (msgError) {
        throw new Error(`Database error: ${msgError.message}`)
      }
      
      // Group by date client-side
      const dateMap = new Map<string, { count: number, users: Set<string> }>()
      
      for (const msg of messages || []) {
        const date = new Date(msg.time).toISOString().split('T')[0]
        if (!dateMap.has(date)) {
          dateMap.set(date, { count: 0, users: new Set() })
        }
        const entry = dateMap.get(date)!
        entry.count++
        entry.users.add(msg.username)
      }
      
      const dates: DateStats[] = Array.from(dateMap.entries())
        .map(([date, stats]) => ({
          date,
          messageCount: stats.count,
          uniqueUsers: stats.users.size
        }))
        .sort((a, b) => b.date.localeCompare(a.date)) // Newest first
      
      return Response.json({ 
        dates,
        totalDays: dates.length,
        totalMessages: messages?.length || 0
      })
    }
    
    return Response.json({ 
      dates: data,
      totalDays: data.length,
      totalMessages: data.reduce((sum: number, d: DateStats) => sum + d.messageCount, 0)
    })
    
  } catch (error) {
    console.error('[AVAILABLE-DATES API] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
