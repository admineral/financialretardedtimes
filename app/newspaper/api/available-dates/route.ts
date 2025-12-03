/**
 * route.ts (available-dates API)
 * 
 * Retrieves all available chat dates with message statistics.
 * 
 * LOCAL: Handles GET requests to fetch dates that have chat messages.
 * Calculates message counts and unique user counts per date.
 * 
 * GLOBAL: Called by the newspaper page on mount to populate the DateTimeline.
 * Provides the list of selectable dates for the archive feature.
 * 
 * ENDPOINT: GET /newspaper/api/available-dates
 * 
 * RESPONSE:
 * - dates: DateStats[] - Array of { date, messageCount, uniqueUsers }
 * - totalDays: number - Total number of days with messages
 * - totalMessages: number - Total message count across all days
 * 
 * IMPLEMENTATION:
 * - Primary: Uses Supabase RPC function 'get_chat_date_stats' for efficiency
 * - Fallback: Client-side aggregation if RPC is unavailable
 * 
 * ERRORS:
 * - 500: Database connection or query errors
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { DateStats } from '../../lib/types'

/**
 * GET handler for fetching available chat dates.
 * Returns dates sorted newest first with message statistics.
 */
export async function GET(request: NextRequest) {
  await headers()
  
  try {
    const supabase = await createClient()
    
    // Try to use the optimized RPC function first
    const { data, error } = await supabase.rpc('get_chat_date_stats')
    
    if (error) {
      // Fallback: If the RPC function doesn't exist, use client-side aggregation
      console.log('[AVAILABLE-DATES API] RPC not available, using fallback query')
      
      const { data: messages, error: msgError } = await supabase
        .from('tv_chat_messages')
        .select('time, username')
        .order('time', { ascending: false })
      
      if (msgError) {
        throw new Error(`Database error: ${msgError.message}`)
      }
      
      // Group messages by date client-side
      const dateMap = new Map<string, { count: number; users: Set<string> }>()
      
      for (const msg of messages || []) {
        const date = new Date(msg.time).toISOString().split('T')[0]
        if (!dateMap.has(date)) {
          dateMap.set(date, { count: 0, users: new Set() })
        }
        const entry = dateMap.get(date)!
        entry.count++
        entry.users.add(msg.username)
      }
      
      // Convert to array and sort
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
    
    // RPC succeeded - return the data
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

