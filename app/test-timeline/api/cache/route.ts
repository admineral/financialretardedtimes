/**
 * route.ts (chat timeline cache API)
 * 
 * API endpoint for storing and retrieving cached chat timeline events.
 * 
 * ENDPOINT: 
 * - GET /test-timeline/api/cache - Retrieve cached timeline
 * - POST /test-timeline/api/cache - Generate and cache new timeline
 * 
 * RESPONSE:
 * - 200: { events: TimelineEvent[], eventCount: number, updatedAt: string }
 * - 404: No cache found
 * - 500: Database error
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Event types
type ChatEventType = 'discussion' | 'prediction' | 'drama' | 'insight' | 'milestone' | 'humor'

interface TimelineEvent {
  id: string
  date: string
  time: string
  title: string
  description: string
  type: ChatEventType
  participants: string[]
  messageCount?: number
}

interface NewspaperData {
  featuredArticle?: {
    headline: string
    summary: string
    author: string
    contributors?: string[]
  }
  secondaryArticle?: {
    headline: string
    summary: string
    author: string
  }
  events?: {
    type: string
    title: string
    summary: string
    participants?: string[]
  }[]
}

// Map newspaper event type to timeline event type
function mapEventType(type: string): ChatEventType {
  const typeMap: Record<string, ChatEventType> = {
    'discussion': 'discussion',
    'debate': 'drama',
    'insight': 'insight',
    'humor': 'humor',
    'milestone': 'milestone'
  }
  return typeMap[type?.toLowerCase()] || 'discussion'
}

/**
 * GET - Retrieve cached timeline
 */
export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data: cache, error } = await supabase
      .from('chat_timeline_cache')
      .select('events, event_count, date_range_start, date_range_end, updated_at')
      .eq('cache_key', 'main')
      .single()
    
    if (error) {
      // Table doesn't exist or no data - return 404 to trigger generation
      if (error.code === 'PGRST116' || error.code === 'PGRST205' || error.code === '42P01') {
        return NextResponse.json({ error: 'No cache found' }, { status: 404 })
      }
      throw error
    }
    
    return NextResponse.json({
      events: cache.events as TimelineEvent[],
      eventCount: cache.event_count,
      dateRangeStart: cache.date_range_start,
      dateRangeEnd: cache.date_range_end,
      updatedAt: cache.updated_at
    })
    
  } catch (error) {
    console.error('[TIMELINE CACHE] GET error:', error)
    // Return 404 for any error to allow fallback
    return NextResponse.json({ error: 'No cache found' }, { status: 404 })
  }
}

/**
 * POST - Generate and cache new timeline from newspaper cache
 */
export async function POST() {
  try {
    const supabase = await createClient()
    
    console.log('[TIMELINE] Generating new timeline from newspaper cache...')
    
    // Fetch all cached newspaper dates (last 14 days, 1-day summaries)
    const { data: newspaperCaches, error: listError } = await supabase
      .from('newspaper_cache')
      .select('cache_date, data, message_count')
      .eq('day_range', 1)
      .order('cache_date', { ascending: false })
      .limit(14)
    
    if (listError) throw listError
    
    if (!newspaperCaches || newspaperCaches.length === 0) {
      return NextResponse.json({ error: 'No newspaper cache found' }, { status: 404 })
    }
    
    // Time slots for distributing events throughout the day
    const timeSlots = ['09:30', '11:15', '14:00', '16:45', '19:30', '21:00']
    
    // Extract events from each newspaper
    const allEvents: TimelineEvent[] = []
    
    for (const cache of newspaperCaches) {
      const newspaper = cache.data as NewspaperData
      let timeIdx = 0
      
      // Featured article
      if (newspaper.featuredArticle?.headline) {
        allEvents.push({
          id: `featured-${cache.cache_date}`,
          date: cache.cache_date,
          time: timeSlots[timeIdx++ % timeSlots.length],
          title: newspaper.featuredArticle.headline,
          description: newspaper.featuredArticle.summary || '',
          type: 'insight',
          participants: [
            newspaper.featuredArticle.author,
            ...(newspaper.featuredArticle.contributors || [])
          ].filter(Boolean).slice(0, 4),
          messageCount: cache.message_count
        })
      }
      
      // Newspaper events
      if (newspaper.events && newspaper.events.length > 0) {
        newspaper.events.forEach((evt, idx) => {
          if (evt.title) {
            allEvents.push({
              id: `event-${cache.cache_date}-${idx}`,
              date: cache.cache_date,
              time: timeSlots[timeIdx++ % timeSlots.length],
              title: evt.title,
              description: evt.summary || '',
              type: mapEventType(evt.type),
              participants: evt.participants || [],
              messageCount: cache.message_count
            })
          }
        })
      }
    }
    
    // Sort by date (newest first)
    allEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    
    // Get date range
    const dates = newspaperCaches.map(c => c.cache_date).sort()
    const dateRangeStart = dates[0]
    const dateRangeEnd = dates[dates.length - 1]
    
    console.log(`[TIMELINE] Generated ${allEvents.length} events from ${newspaperCaches.length} days`)
    
    // Try to save to cache (skip if table doesn't exist)
    try {
      const { error: upsertError } = await supabase
        .from('chat_timeline_cache')
        .upsert({
          cache_key: 'main',
          events: allEvents,
          event_count: allEvents.length,
          date_range_start: dateRangeStart,
          date_range_end: dateRangeEnd,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'cache_key'
        })
      
      if (upsertError) {
        // Table doesn't exist - just skip caching
        if (upsertError.code === 'PGRST205' || upsertError.code === '42P01') {
          console.log('[TIMELINE] Cache table not found, skipping save')
        } else {
          console.error('[TIMELINE] Cache save error:', upsertError)
        }
      } else {
        console.log('[TIMELINE] Cache saved successfully')
      }
    } catch (saveErr) {
      console.log('[TIMELINE] Cache save skipped:', saveErr)
    }
    
    return NextResponse.json({
      success: true,
      events: allEvents,
      eventCount: allEvents.length,
      dateRangeStart,
      dateRangeEnd,
      updatedAt: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('[TIMELINE CACHE] POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

