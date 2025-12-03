/**
 * route.ts (Fear & Greed Cache API)
 * 
 * Handles caching of Fear & Greed sentiment data in Supabase.
 * Cache is valid for 4 hours to balance freshness with API costs.
 * 
 * LOCAL: Provides GET/POST endpoints for cache retrieval and storage.
 * Called by FearGreedWidget component to check/save cached data.
 * 
 * GLOBAL: Reduces OpenAI API calls by caching daily sentiment analysis.
 * 
 * ENDPOINT: /test-fg/api/cache
 * 
 * GET: Retrieve cached Fear & Greed data for today
 * POST: Save Fear & Greed data to cache
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Fear & Greed cache data structure.
 * Matches the FearGreedSchema from the analyze route.
 */
interface FearGreedCacheData {
  today: {
    index: number
    classification: string
    classificationDE: string
  }
  last3Days: {
    index: number
    classification: string
    classificationDE: string
  }
  last7Days: {
    index: number
    classification: string
    classificationDE: string
  }
  trend: 'rising' | 'falling' | 'stable'
  insight: string
  topDrivers: string[]
}

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check if cache is still valid (less than 4 hours old).
 * 
 * @param updatedAt - ISO timestamp of last cache update
 * @returns true if cache is still valid
 */
function isCacheValid(updatedAt: string): boolean {
  const cacheTime = new Date(updatedAt).getTime()
  const now = Date.now()
  const fourHoursMs = 4 * 60 * 60 * 1000
  return (now - cacheTime) < fourHoursMs
}

// ═══════════════════════════════════════════════════════════════════════
// GET HANDLER
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET - Retrieve cached Fear & Greed data for today.
 * Returns 404 if no valid cache exists.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const today = new Date().toISOString().split('T')[0]
    
    const { data, error } = await supabase
      .from('fear_greed_cache')
      .select('*')
      .eq('cache_date', today)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No cache found
        return Response.json({ cached: false }, { status: 404 })
      }
      throw error
    }
    
    if (!data || !isCacheValid(data.updated_at)) {
      return Response.json({ cached: false, stale: true }, { status: 404 })
    }
    
    // Reconstruct the full data object from DB columns
    const cacheData: FearGreedCacheData = {
      today: {
        index: data.today_index,
        classification: data.today_classification,
        classificationDE: data.today_classification_de
      },
      last3Days: {
        index: data.last_3_days_index,
        classification: data.last_3_days_classification,
        classificationDE: data.last_3_days_classification_de
      },
      last7Days: {
        index: data.last_7_days_index,
        classification: data.last_7_days_classification,
        classificationDE: data.last_7_days_classification_de
      },
      trend: data.trend,
      insight: data.insight || data.full_data?.insight || '',
      topDrivers: data.top_drivers || data.full_data?.topDrivers || []
    }
    
    console.log(`[FEAR-GREED CACHE] ✅ Cache hit for ${today}`)
    
    return Response.json({
      cached: true,
      data: cacheData,
      updatedAt: data.updated_at,
      messageCount: data.message_count,
      uniqueUsers: data.unique_users
    })
    
  } catch (error) {
    console.error('[FEAR-GREED CACHE] GET Error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════
// POST HANDLER
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST - Save Fear & Greed data to cache.
 * Upserts data for today's date.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { data, messageCount, uniqueUsers }: { 
      data: FearGreedCacheData
      messageCount?: number
      uniqueUsers?: number 
    } = body
    
    if (!data || !data.today || !data.last3Days || !data.last7Days) {
      return Response.json({ error: 'Invalid data' }, { status: 400 })
    }
    
    const supabase = await createClient()
    const today = new Date().toISOString().split('T')[0]
    
    const { error } = await supabase
      .from('fear_greed_cache')
      .upsert({
        cache_date: today,
        // Today's sentiment
        today_index: data.today.index,
        today_classification: data.today.classification,
        today_classification_de: data.today.classificationDE,
        // Last 3 days sentiment
        last_3_days_index: data.last3Days.index,
        last_3_days_classification: data.last3Days.classification,
        last_3_days_classification_de: data.last3Days.classificationDE,
        // Last 7 days sentiment
        last_7_days_index: data.last7Days.index,
        last_7_days_classification: data.last7Days.classification,
        last_7_days_classification_de: data.last7Days.classificationDE,
        // Trend and insight
        trend: data.trend,
        insight: data.insight,
        top_drivers: data.topDrivers,
        // Full data for backwards compatibility
        full_data: {
          insight: data.insight,
          topDrivers: data.topDrivers
        },
        // Metadata
        message_count: messageCount || 0,
        unique_users: uniqueUsers || 0,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'cache_date'
      })
    
    if (error) {
      console.error('[FEAR-GREED CACHE] Save error:', error)
      throw error
    }
    
    console.log(`[FEAR-GREED CACHE] ✅ Saved for ${today}: Today=${data.today.index}, 3d=${data.last3Days.index}, 7d=${data.last7Days.index}`)
    return Response.json({ success: true })
    
  } catch (error) {
    console.error('[FEAR-GREED CACHE] POST Error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
