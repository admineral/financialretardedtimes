/**
 * route.ts (Fear & Greed Cache API)
 * 
 * GET: Retrieve cached Fear & Greed data for today
 * POST: Save Fear & Greed data to cache
 * 
 * ENDPOINT: /test-fg/api/cache
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  trendInsight: string
  drivers: unknown[]
  quotes: unknown[]
  summary: string
}

/**
 * Check if cache is still valid (less than 4 hours old)
 */
function isCacheValid(updatedAt: string): boolean {
  const cacheTime = new Date(updatedAt).getTime()
  const now = Date.now()
  const fourHoursMs = 4 * 60 * 60 * 1000
  return (now - cacheTime) < fourHoursMs
}

/**
 * GET - Retrieve cached Fear & Greed data
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
    
    // Reconstruct the full data object
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
      trendInsight: data.full_data?.trendInsight || '',
      drivers: data.full_data?.drivers || [],
      quotes: data.full_data?.quotes || [],
      summary: data.full_data?.summary || ''
    }
    
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

/**
 * POST - Save Fear & Greed data to cache
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
        today_index: data.today.index,
        today_classification: data.today.classification,
        today_classification_de: data.today.classificationDE,
        last_3_days_index: data.last3Days.index,
        last_3_days_classification: data.last3Days.classification,
        last_3_days_classification_de: data.last3Days.classificationDE,
        last_7_days_index: data.last7Days.index,
        last_7_days_classification: data.last7Days.classification,
        last_7_days_classification_de: data.last7Days.classificationDE,
        trend: data.trend,
        trend_insight: data.trendInsight,
        full_data: {
          trendInsight: data.trendInsight,
          drivers: data.drivers,
          quotes: data.quotes,
          summary: data.summary
        },
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
    
    console.log(`[FEAR-GREED CACHE] ✅ Saved for ${today}`)
    return Response.json({ success: true })
    
  } catch (error) {
    console.error('[FEAR-GREED CACHE] POST Error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

