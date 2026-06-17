/**
 * route.ts (newspaper cache list API)
 * 
 * API endpoint for listing all cached newspaper dates.
 * 
 * LOCAL: Handles GET requests to fetch a list of all cached newspaper dates
 * with their metadata. Used by the timeline component to know which dates
 * have cached content available.
 * 
 * GLOBAL: Enables the infinite scroll timeline feature by providing
 * a list of dates that can be loaded progressively.
 * 
 * ENDPOINT: GET /newspaper/api/cache-list?dayRange=1&limit=10&offset=0
 * 
 * QUERY PARAMS:
 * - dayRange: number (optional, default 1) - Filter by day range (1, 3, or 7)
 * - limit: number (optional, default 10) - Max items to return
 * - offset: number (optional, default 0) - Pagination offset
 * 
 * RESPONSE:
 * - 200: { dates: CachedDate[], total: number, hasMore: boolean }
 * - 500: Database error
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface CachedDate {
  date: string
  messageCount: number
  uniqueUsers: number
  updatedAt: string
  dayRange: number
}

export async function GET(request: NextRequest) {
  const dayRangeParam = request.nextUrl.searchParams.get('dayRange')
  const limitParam = request.nextUrl.searchParams.get('limit')
  const offsetParam = request.nextUrl.searchParams.get('offset')
  
  const dayRange = dayRangeParam ? parseInt(dayRangeParam, 10) : 1
  const limit = limitParam ? parseInt(limitParam, 10) : 10
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0
  
  // Validate dayRange
  if (![1, 3, 7].includes(dayRange)) {
    return NextResponse.json({ error: 'Invalid dayRange. Must be 1, 3, or 7' }, { status: 400 })
  }
  
  try {
    const supabase = await createClient()

    // Hot path for page bootstrapping: only the newest cached date is needed,
    // so avoid the extra count query.
    if (limit === 1 && offset === 0) {
      const { data: cacheData, error } = await supabase
        .from('newspaper_cache')
        .select('cache_date, message_count, unique_users, updated_at, day_range')
        .eq('day_range', dayRange)
        .order('cache_date', { ascending: false })
        .limit(1)

      if (error) {
        if (error.code === '42703' || error.message?.includes('day_range')) {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('newspaper_cache')
            .select('cache_date, message_count, unique_users, updated_at')
            .order('cache_date', { ascending: false })
            .limit(1)

          if (fallbackError) throw fallbackError

          const dates: CachedDate[] = (fallbackData || []).map(row => ({
            date: row.cache_date,
            messageCount: row.message_count,
            uniqueUsers: row.unique_users,
            updatedAt: row.updated_at,
            dayRange: 1
          }))

          return NextResponse.json({
            dates,
            total: dates.length,
            hasMore: false
          })
        }

        throw error
      }

      const dates: CachedDate[] = (cacheData || []).map(row => ({
        date: row.cache_date,
        messageCount: row.message_count,
        uniqueUsers: row.unique_users,
        updatedAt: row.updated_at,
        dayRange: row.day_range || 1
      }))

      return NextResponse.json({
        dates,
        total: dates.length,
        hasMore: false
      })
    }
    
    // Count total cached entries
    const { count, error: countError } = await supabase
      .from('newspaper_cache')
      .select('*', { count: 'exact', head: true })
      .eq('day_range', dayRange)
    
    if (countError) {
      // If day_range column doesn't exist, use fallback
      if (countError.code === '42703' || countError.message?.includes('day_range')) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('newspaper_cache')
          .select('cache_date, message_count, unique_users, updated_at')
          .order('cache_date', { ascending: false })
          .range(offset, offset + limit - 1)
        
        if (fallbackError) throw fallbackError
        
        const dates: CachedDate[] = (fallbackData || []).map(row => ({
          date: row.cache_date,
          messageCount: row.message_count,
          uniqueUsers: row.unique_users,
          updatedAt: row.updated_at,
          dayRange: 1
        }))
        
        return NextResponse.json({
          dates,
          total: dates.length,
          hasMore: false
        })
      }
      throw countError
    }
    
    // Fetch cached dates with metadata
    const { data: cacheData, error } = await supabase
      .from('newspaper_cache')
      .select('cache_date, message_count, unique_users, updated_at, day_range')
      .eq('day_range', dayRange)
      .order('cache_date', { ascending: false })
      .range(offset, offset + limit - 1)
    
    if (error) throw error
    
    const dates: CachedDate[] = (cacheData || []).map(row => ({
      date: row.cache_date,
      messageCount: row.message_count,
      uniqueUsers: row.unique_users,
      updatedAt: row.updated_at,
      dayRange: row.day_range || 1
    }))
    
    const total = count || 0
    const hasMore = offset + dates.length < total
    
    return NextResponse.json({
      dates,
      total,
      hasMore
    })
    
  } catch (error) {
    console.error('[CACHE-LIST] ❌', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

