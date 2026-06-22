/**
 * route.ts (newspaper cache API)
 * 
 * API endpoint for retrieving cached newspaper content from Supabase.
 * 
 * LOCAL: Handles GET requests to fetch cached newspaper data for a specific date
 * and day range (1, 3, or 7 days).
 * Returns cached content if available, or 404 if no cache exists.
 * 
 * GLOBAL: Used by NewspaperContent component to check for existing cache
 * before triggering expensive AI generation. Reduces API costs and improves UX.
 * 
 * ENDPOINT: GET /newspaper/api/cache?date=YYYY-MM-DD&dayRange=1
 * 
 * QUERY PARAMS:
 * - date: string (required) - The start date to fetch cache for (YYYY-MM-DD format)
 * - dayRange: number (optional, default 1) - Number of days (1, 3, or 7)
 * 
 * RESPONSE:
 * - 200: { data: UnifiedNewspaperData, messageCount: number, uniqueUsers: number, updatedAt: string, dayRange: number }
 * - 400: Missing date parameter
 * - 404: No cache found for this date/range
 * - 500: Database error
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cacheLogger as log } from '@/lib/logger'
import { isNewspaperIssue } from '../../engine'

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date')
  const dayRangeParam = request.nextUrl.searchParams.get('dayRange')
  const dayRange = dayRangeParam ? parseInt(dayRangeParam, 10) : 1
  
  if (!date) {
    return NextResponse.json({ error: 'Missing date parameter' }, { status: 400 })
  }
  
  // Validate dayRange
  if (![1, 3, 7].includes(dayRange)) {
    return NextResponse.json({ error: 'Invalid dayRange. Must be 1, 3, or 7' }, { status: 400 })
  }
  
  try {
    const supabase = await createClient()
    
    // Try to fetch with day_range first
    let query = supabase
      .from('newspaper_cache')
      .select('data, message_count, unique_users, updated_at, day_range')
      .eq('cache_date', date)
    
    // Add day_range filter
    query = query.eq('day_range', dayRange)
    
    const { data: cache, error } = await query.single()
    
    if (error) {
      // Check if it's a "column doesn't exist" error (migration not applied yet)
      if (error.code === '42703' || error.message?.includes('day_range')) {
        // Fallback: try without day_range filter (for backwards compatibility)
        const { data: fallbackCache, error: fallbackError } = await supabase
          .from('newspaper_cache')
          .select('data, message_count, unique_users, updated_at')
          .eq('cache_date', date)
          .single()
        
        if (fallbackError) {
          if (fallbackError.code === 'PGRST116') {
            return NextResponse.json({ error: 'No cache found' }, { status: 404 })
          }
          throw fallbackError
        }
        
        const legacyData = isNewspaperIssue(fallbackCache.data)
          ? fallbackCache.data.modules.articleDigest.data
          : fallbackCache.data

        return NextResponse.json({
          data: legacyData,
          messageCount: fallbackCache.message_count,
          uniqueUsers: fallbackCache.unique_users,
          updatedAt: fallbackCache.updated_at,
          dayRange: 1 // Default for old cache entries
        })
      }
      
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'No cache found' }, { status: 404 })
      }
      throw error
    }
    
    const legacyData = isNewspaperIssue(cache.data)
      ? cache.data.modules.articleDigest.data
      : cache.data

    return NextResponse.json({
      data: legacyData,
      messageCount: cache.message_count,
      uniqueUsers: cache.unique_users,
      updatedAt: cache.updated_at,
      dayRange: cache.day_range || 1
    })
    
  } catch (error) {
    log.error('Cache fetch failed', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
