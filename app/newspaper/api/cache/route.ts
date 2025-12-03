/**
 * route.ts (newspaper cache API)
 * 
 * API endpoint for retrieving cached newspaper content from Supabase.
 * 
 * LOCAL: Handles GET requests to fetch cached newspaper data for a specific date.
 * Returns cached content if available, or 404 if no cache exists.
 * 
 * GLOBAL: Used by NewspaperContent component to check for existing cache
 * before triggering expensive AI generation. Reduces API costs and improves UX.
 * 
 * ENDPOINT: GET /newspaper/api/cache?date=YYYY-MM-DD
 * 
 * QUERY PARAMS:
 * - date: string (required) - The date to fetch cache for (YYYY-MM-DD format)
 * 
 * RESPONSE:
 * - 200: { data: UnifiedNewspaperData, messageCount: number, uniqueUsers: number, updatedAt: string }
 * - 400: Missing date parameter
 * - 404: No cache found for this date
 * - 500: Database error
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const date = searchParams.get('date')
  
  if (!date) {
    return NextResponse.json(
      { error: 'Missing date parameter' },
      { status: 400 }
    )
  }
  
  try {
    const supabase = await createClient()
    
    const { data: cache, error } = await supabase
      .from('newspaper_cache')
      .select('data, message_count, unique_users, updated_at')
      .eq('cache_date', date)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return NextResponse.json(
          { error: 'No cache found for this date' },
          { status: 404 }
        )
      }
      throw error
    }
    
    return NextResponse.json({
      data: cache.data,
      messageCount: cache.message_count,
      uniqueUsers: cache.unique_users,
      updatedAt: cache.updated_at
    })
    
  } catch (error) {
    console.error('[CACHE API] Error fetching cache:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

