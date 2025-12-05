/**
 * route.ts (available-dates API)
 * 
 * Retrieves all available chat dates with message statistics.
 * 
 * LOCAL: Handles GET requests to fetch dates that have chat messages.
 * Calculates message counts and unique user counts per date.
 * Uses Supabase caching to avoid expensive queries on every page load.
 * 
 * GLOBAL: Called by the newspaper page on mount to populate the DateTimeline.
 * Provides the list of selectable dates for the archive feature.
 * 
 * ENDPOINT: GET /newspaper/api/available-dates
 * 
 * QUERY PARAMS:
 * - refresh: boolean (optional) - Force cache refresh
 * 
 * RESPONSE:
 * - dates: DateStats[] - Array of { date, messageCount, uniqueUsers }
 * - totalDays: number - Total number of days with messages
 * - totalMessages: number - Total message count across all days
 * - cumulativeUsers: Record<number, number> - Deduplicated user counts for 1d, 3d, 7d
 * - isFromCache: boolean - Whether the response is from cache
 * 
 * CACHING:
 * - Results are cached in Supabase 'date_stats_cache' table
 * - Cache is valid for 5 minutes
 * - Cache can be force-refreshed with ?refresh=true
 * 
 * ERRORS:
 * - 500: Database connection or query errors
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { newspaperLogger as log } from '@/lib/logger'
import type { DateStats } from '../../lib/types'

// Cache duration for "today's" data in milliseconds (5 minutes)
// Past days don't change, so we only need to refresh if today's data might have new messages
const TODAY_CACHE_DURATION_MS = 5 * 60 * 1000

/**
 * Check if cache is still valid
 * - If the most recent date in cache is today: cache is valid for 5 minutes
 * - If the most recent date is older than today: cache is INVALID (new day started)
 */
function isCacheValid(updatedAt: string, dates: DateStats[]): boolean {
  if (!dates || dates.length === 0) return false
  
  const today = new Date().toISOString().split('T')[0]
  const mostRecentDateInCache = dates[0]?.date
  
  // If cache doesn't contain today's data, it's stale - a new day has started
  // We need to refresh to check if there are messages for today
  if (mostRecentDateInCache < today) {
    return false
  }
  
  // If cache contains today's data, check if it's fresh enough (5 minutes)
  const cacheTime = new Date(updatedAt).getTime()
  const now = Date.now()
  return (now - cacheTime) < TODAY_CACHE_DURATION_MS
}

/**
 * Calculate date statistics from messages
 */
function calculateStats(messages: Array<{ time: string; username: string }>) {
  // Group messages by date
  const dateMap = new Map<string, { count: number; users: Set<string> }>()
  
  for (const msg of messages) {
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
  
  // Calculate deduplicated user counts for multi-day ranges
  const sortedDates = dates.map(d => d.date)
  const usersByDate = new Map<string, Set<string>>()
  for (const msg of messages) {
    const date = new Date(msg.time).toISOString().split('T')[0]
    if (!usersByDate.has(date)) {
      usersByDate.set(date, new Set())
    }
    usersByDate.get(date)!.add(msg.username)
  }
  
  // Pre-calculate cumulative unique users for 1d, 3d, 7d ranges
  const cumulativeUsers: Record<number, number> = {}
  for (const range of [1, 3, 7]) {
    const usersInRange = new Set<string>()
    const datesToInclude = sortedDates.slice(0, range)
    for (const date of datesToInclude) {
      const users = usersByDate.get(date)
      if (users) {
        users.forEach(u => usersInRange.add(u))
      }
    }
    cumulativeUsers[range] = usersInRange.size
  }
  
  return { dates, cumulativeUsers, totalMessages: messages.length }
}

/**
 * GET handler for fetching available chat dates.
 * Returns dates sorted newest first with message statistics.
 */
export async function GET(request: NextRequest) {
  await headers()
  
  const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true'
  
  try {
    const supabase = await createClient()
    
    // Try to get from cache first (unless force refresh)
    if (!forceRefresh) {
      const { data: cachedData, error: cacheError } = await supabase
        .from('date_stats_cache')
        .select('dates, cumulative_users, total_days, total_messages, updated_at')
        .eq('cache_key', 'date_stats')
        .single()
      
      if (!cacheError && cachedData && isCacheValid(cachedData.updated_at, cachedData.dates)) {
        log.debug('Cache hit for available dates')
        return Response.json({
          dates: cachedData.dates,
          totalDays: cachedData.total_days,
          totalMessages: cachedData.total_messages,
          cumulativeUsers: cachedData.cumulative_users,
          isFromCache: true,
          cacheAge: Date.now() - new Date(cachedData.updated_at).getTime()
        })
      }
    }
    
    log.debug('Fetching fresh available dates')
    
    // Paginate to get all messages (Supabase limits to 1000 per request)
    const allMessages: Array<{ time: string; username: string }> = []
    const pageSize = 1000
    let offset = 0
    let hasMore = true
    
    while (hasMore) {
      const { data: pageMessages, error: pageError } = await supabase
        .from('tv_chat_messages')
        .select('time, username')
        .order('time', { ascending: false })
        .range(offset, offset + pageSize - 1)
      
      if (pageError) {
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
    
    log.info('Fetched messages for date stats', { count: allMessages.length })
    
    // Calculate statistics
    const { dates, cumulativeUsers, totalMessages } = calculateStats(allMessages)
    
    // Update cache in Supabase (upsert)
    const { error: upsertError } = await supabase
      .from('date_stats_cache')
      .upsert({
        cache_key: 'date_stats',
        dates: dates,
        cumulative_users: cumulativeUsers,
        total_days: dates.length,
        total_messages: totalMessages,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'cache_key'
      })
    
    if (upsertError) {
      log.warn('Failed to update date stats cache', { error: upsertError.message })
    }
    
    return Response.json({ 
      dates,
      totalDays: dates.length,
      totalMessages,
      cumulativeUsers,
      isFromCache: false
    })
    
  } catch (error) {
    log.error('Failed to fetch available dates', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

