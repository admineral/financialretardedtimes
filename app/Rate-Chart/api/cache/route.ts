/**
 * route.ts (rate chart cache API)
 * 
 * API endpoint for managing cached rate chart prediction data in Supabase.
 * 
 * LOCAL: Handles GET/POST requests to fetch and store cached prediction data.
 * 
 * GLOBAL: Used by Rate-Chart page to cache processed predictions,
 * reducing the need to re-fetch and re-parse thousands of messages.
 * 
 * ENDPOINTS:
 * - GET /Rate-Chart/api/cache?date=YYYY-MM-DD - Fetch cached data for a date
 * - POST /Rate-Chart/api/cache - Store/update cache for a date
 * 
 * CACHE DURATION: 5 minutes (300 seconds)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Cache is valid for 5 minutes
const CACHE_DURATION_MS = 5 * 60 * 1000

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date')
  
  if (!date) {
    return NextResponse.json({ error: 'Missing date parameter' }, { status: 400 })
  }
  
  try {
    const supabase = await createClient()
    
    const { data: cache, error } = await supabase
      .from('rate_chart_cache')
      .select('*')
      .eq('cache_date', date)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No cache found
        return NextResponse.json({ found: false }, { status: 200 })
      }
      throw error
    }
    
    // Check if cache is still valid (within 5 minutes)
    const cacheAge = Date.now() - new Date(cache.updated_at).getTime()
    const isValid = cacheAge < CACHE_DURATION_MS
    
    console.log(`[RATE CACHE] 📦 Cache for ${date}: ${isValid ? 'VALID' : 'EXPIRED'} (${Math.round(cacheAge / 1000)}s old)`)
    
    return NextResponse.json({
      found: true,
      valid: isValid,
      cacheAge: cacheAge,
      messages: cache.messages,
      priceGuesses: cache.price_guesses,
      messageCount: cache.message_count,
      participantCount: cache.participant_count,
      predictionCount: cache.prediction_count,
      resetTimestamp: cache.reset_timestamp,
      updatedAt: cache.updated_at
    })
    
  } catch (error) {
    console.error('[RATE CACHE] ❌', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      date, 
      messages, 
      priceGuesses, 
      messageCount, 
      participantCount, 
      predictionCount,
      resetTimestamp 
    } = body
    
    if (!date) {
      return NextResponse.json({ error: 'Missing date parameter' }, { status: 400 })
    }
    
    const supabase = await createClient()
    
    // Upsert the cache entry (insert or update if exists)
    const { data, error } = await supabase
      .from('rate_chart_cache')
      .upsert({
        cache_date: date,
        messages: messages || [],
        price_guesses: priceGuesses || [],
        message_count: messageCount || 0,
        participant_count: participantCount || 0,
        prediction_count: predictionCount || 0,
        reset_timestamp: resetTimestamp || null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'cache_date'
      })
      .select()
      .single()
    
    if (error) {
      throw error
    }
    
    console.log(`[RATE CACHE] ✅ Cached ${messageCount} messages, ${predictionCount} predictions for ${date}`)
    
    return NextResponse.json({
      success: true,
      updatedAt: data.updated_at
    })
    
  } catch (error) {
    console.error('[RATE CACHE] ❌', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

