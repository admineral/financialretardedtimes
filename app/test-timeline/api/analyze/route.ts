/**
 * route.ts (Timeline AI Analysis)
 * 
 * AI-powered timeline event extraction from chat messages.
 * The model picks the most interesting moments with REAL timestamps and quotes.
 * 
 * ENDPOINT: POST /test-timeline/api/analyze
 * 
 * REQUEST BODY:
 * - mode: '24h' | '3d' | '7d' - Time range (default: '24h')
 * - startDate?: string - Optional start date for custom range
 * 
 * RESPONSE: Streaming JSON with timeline events
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { z } from 'zod'

// ═══════════════════════════════════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════════════════════════════════

const TimelineEventSchema = z.object({
  timestamp: z.string().describe('Exakter Zeitstempel aus dem Chat (ISO format oder DD.MM HH:MM)'),
  time: z.string().describe('Uhrzeit für Anzeige (HH:MM format)'),
  date: z.string().describe('Datum (YYYY-MM-DD format)'),
  title: z.string().max(60).describe('Kurzer, prägnanter Titel (max 60 Zeichen)'),
  quote: z.string().max(150).describe('Das beste Zitat zu diesem Event (max 150 Zeichen)'),
  quoteAuthor: z.string().describe('Username des Zitierten'),
  description: z.string().max(200).describe('Kurze Beschreibung was passiert ist (max 200 Zeichen)'),
  type: z.enum(['discussion', 'prediction', 'drama', 'insight', 'milestone', 'humor']),
  participants: z.array(z.string()).min(1).max(6).describe('Beteiligte User (1-6)'),
  sentiment: z.enum(['bullish', 'bearish', 'neutral', 'mixed']).optional(),
})

const TimelineResponseSchema = z.object({
  events: z.array(TimelineEventSchema).min(2).max(10).describe('Die wichtigsten Events (2-10, je nach Aktivität)'),
  summary: z.string().max(100).describe('Ein-Satz-Zusammenfassung des Zeitraums'),
  activityLevel: z.enum(['low', 'medium', 'high']).describe('Wie aktiv war der Chat?'),
  dominantSentiment: z.enum(['bullish', 'bearish', 'neutral', 'mixed']),
})

export type TimelineEvent = z.infer<typeof TimelineEventSchema>
export type TimelineResponse = z.infer<typeof TimelineResponseSchema>

// ═══════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════

const TIMELINE_PROMPT = `Du bist ein Chat-Kurator für die "Financial Retarded Times" Timeline.

## ⛔ IGNORIEREN: RATE CHART GAME TIPPS
Nachrichten die mit "//" und einem Preis beginnen (z.B. //88.5k, //95000, //92K) sind 
SPIELTIPPS und müssen KOMPLETT IGNORIERT werden!

## DEINE AUFGABE

Analysiere den Chat und extrahiere die INTERESSANTESTEN MOMENTE mit:
- ECHTEN Zeitstempeln aus dem Chat
- ECHTEN Zitaten (Originaltext!)
- Den beteiligten Usern

## EVENT-TYPEN

- **discussion**: Technische Diskussionen, Analysen
- **prediction**: Preisprognosen, Calls (Long/Short)
- **drama**: Beef, Meinungsverschiedenheiten, Streit
- **insight**: Gute Erkenntnisse, AHA-Momente
- **milestone**: Wichtige Preisniveaus erreicht, besondere Ereignisse
- **humor**: Lustige Momente, Witze, Fails

## REGELN

1. **ECHTE ZEITEN**: Nutze die Zeitstempel aus dem Chat, KEINE fiktiven Zeiten!
2. **ECHTE ZITATE**: Kopiere interessante Nachrichten wörtlich (gekürzt wenn nötig)
3. **FLEXIBEL**: Bei wenig Aktivität → weniger Events (min 2). Bei viel Aktivität → mehr (max 10)
4. **MORGENS**: Wenn es früh am Tag ist, gibt es weniger Events - das ist OK!
5. **CHRONOLOGISCH**: Events sollten zeitlich verteilt sein, nicht alle am gleichen Zeitpunkt
6. **VIELFALT**: Verschiedene Event-Typen mischen, nicht nur discussions

## FORMAT

- timestamp: Der echte Zeitstempel (z.B. "2024-12-07T10:23:00" oder aus dem Chat)
- time: Nur die Uhrzeit für Anzeige (z.B. "10:23")
- date: Nur das Datum (z.B. "2024-12-07")
- quote: Ein echtes Zitat aus dem Chat, mit @username wenn sinnvoll
- quoteAuthor: Wer hat das gesagt?

## ACTIVITY LEVEL

- **low**: < 50 Nachrichten, wenig los → 2-3 Events
- **medium**: 50-200 Nachrichten → 4-6 Events
- **high**: > 200 Nachrichten → 6-10 Events

Gib NUR so viele Events zurück wie es ECHTE interessante Momente gibt!`

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

interface ChatMessage {
  username: string
  text: string
  time: string
}

function getDateRange(mode: string): { startDate: Date; endDate: Date } {
  const now = new Date()
  const endDate = now
  let startDate = new Date()
  
  switch (mode) {
    case '24h':
      startDate.setHours(startDate.getHours() - 24)
      break
    case '3d':
      startDate.setDate(startDate.getDate() - 3)
      break
    case '7d':
      startDate.setDate(startDate.getDate() - 7)
      break
    default:
      startDate.setHours(startDate.getHours() - 24)
  }
  
  return { startDate, endDate }
}

function formatChatForAI(messages: ChatMessage[]): string {
  // Group by day
  const byDay = new Map<string, ChatMessage[]>()
  
  for (const msg of messages) {
    const day = new Date(msg.time).toISOString().split('T')[0]
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(msg)
  }
  
  const lines: string[] = []
  const sortedDays = Array.from(byDay.keys()).sort()
  
  for (const day of sortedDays) {
    const dayMsgs = byDay.get(day)!
    const dayFormatted = new Date(day).toLocaleDateString('de-DE', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
    })
    
    lines.push(`\n═══ ${dayFormatted} (${dayMsgs.length} Nachrichten) ═══\n`)
    
    for (const msg of dayMsgs) {
      const time = new Date(msg.time).toLocaleTimeString('de-DE', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'
      })
      const dateStr = new Date(msg.time).toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin'
      })
      const text = msg.text.length > 300 ? msg.text.slice(0, 300) + '...' : msg.text
      lines.push(`[${dateStr} ${time}] @${msg.username}: ${text}`)
    }
  }
  
  return lines.join('\n')
}

// ═══════════════════════════════════════════════════════════════════════
// POST HANDLER
// ═══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  await headers()
  
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
  
  try {
    const body = await request.json().catch(() => ({}))
    const mode = body.mode || '24h'
    
    const supabase = await createClient()
    const { startDate, endDate } = getDateRange(mode)
    
    console.log(`[TIMELINE-AI] ════════════════════════════════════════════`)
    console.log(`[TIMELINE-AI] 📅 Mode: ${mode}`)
    console.log(`[TIMELINE-AI] 📅 Range: ${startDate.toISOString()} → ${endDate.toISOString()}`)
    
    // Fetch messages
    const allMessages: ChatMessage[] = []
    const pageSize = 1000
    let offset = 0
    let hasMore = true
    
    while (hasMore) {
      const { data: pageMessages, error } = await supabase
        .from('tv_chat_messages')
        .select('username, text, time')
        .gte('time', startDate.toISOString())
        .lte('time', endDate.toISOString())
        .order('time', { ascending: true })
        .range(offset, offset + pageSize - 1)
      
      if (error) throw new Error(`Database error: ${error.message}`)
      
      if (!pageMessages || pageMessages.length === 0) {
        hasMore = false
      } else {
        allMessages.push(...pageMessages)
        offset += pageSize
        hasMore = pageMessages.length === pageSize
      }
    }
    
    if (allMessages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No messages found', events: [], activityLevel: 'low' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    const uniqueUsers = new Set(allMessages.map(m => m.username)).size
    const chatContext = formatChatForAI(allMessages)
    
    // Determine expected event count based on activity
    let expectedEvents = '2-4'
    let activityHint = 'niedrig'
    if (allMessages.length > 200) {
      expectedEvents = '6-10'
      activityHint = 'hoch'
    } else if (allMessages.length > 50) {
      expectedEvents = '4-6'
      activityHint = 'mittel'
    }
    
    const currentTime = new Date().toLocaleString('de-DE', {
      hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
      timeZone: 'Europe/Berlin'
    })
    
    console.log(`[TIMELINE-AI] 📊 Messages: ${allMessages.length}`)
    console.log(`[TIMELINE-AI] 👥 Users: ${uniqueUsers}`)
    console.log(`[TIMELINE-AI] 🎯 Expected events: ${expectedEvents} (${activityHint})`)
    console.log(`[TIMELINE-AI] ════════════════════════════════════════════`)
    
    // Stream AI response
    const result = streamObject({
      model: openai('gpt-4o-mini'),
      schema: TimelineResponseSchema,
      system: TIMELINE_PROMPT,
      prompt: `Aktueller Zeitpunkt: ${currentTime}
Zeitraum: ${mode === '24h' ? 'Letzte 24 Stunden' : mode === '3d' ? 'Letzte 3 Tage' : 'Letzte 7 Tage'}
Aktivität: ${activityHint} (${allMessages.length} Nachrichten von ${uniqueUsers} Usern)
Erwartete Events: ${expectedEvents}

${chatContext}`,
      temperature: 0.7,
      onFinish: async ({ object }) => {
        if (object) {
          console.log(`[TIMELINE-AI] ✅ Generated ${object.events?.length || 0} events`)
          
          // Save to cache
          try {
            await supabase
              .from('chat_timeline_cache')
              .upsert({
                cache_key: `timeline-${mode}`,
                events: object.events,
                event_count: object.events?.length || 0,
                date_range_start: startDate.toISOString().split('T')[0],
                date_range_end: endDate.toISOString().split('T')[0],
                updated_at: new Date().toISOString(),
                metadata: {
                  mode,
                  messageCount: allMessages.length,
                  uniqueUsers,
                  summary: object.summary,
                  activityLevel: object.activityLevel,
                  dominantSentiment: object.dominantSentiment
                }
              }, { onConflict: 'cache_key' })
            
            console.log(`[TIMELINE-AI] ✅ Cached (${mode})`)
          } catch (cacheErr) {
            console.error('[TIMELINE-AI] Cache error:', cacheErr)
          }
        }
      }
    })
    
    return result.toTextStreamResponse()
    
  } catch (error) {
    console.error('[TIMELINE-AI] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// Cache configuration
const CACHE_MAX_AGE_HOURS = 4 // Invalidate cache if older than 4 hours
const CACHE_STALE_MINUTES = 30 // Consider stale after 30 minutes (background refresh)

/**
 * Check if cache is too old and needs refresh
 */
function getCacheStatus(updatedAt: string): { isValid: boolean; isStale: boolean; ageMinutes: number } {
  const cacheTime = new Date(updatedAt).getTime()
  const now = Date.now()
  const ageMinutes = Math.floor((now - cacheTime) / (1000 * 60))
  const ageHours = ageMinutes / 60
  
  return {
    isValid: ageHours < CACHE_MAX_AGE_HOURS,
    isStale: ageMinutes > CACHE_STALE_MINUTES,
    ageMinutes
  }
}

/**
 * GET - Return cached timeline analysis with cache age checking
 * 
 * Returns:
 * - cached: true if cache exists
 * - stale: true if cache is older than 30 minutes (client should refresh in background)
 * - expired: true if cache is older than 4 hours (client must refresh)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode') || '24h'
    
    const supabase = await createClient()
    
    const { data: cache, error } = await supabase
      .from('chat_timeline_cache')
      .select('*')
      .eq('cache_key', `timeline-${mode}`)
      .single()
    
    if (error || !cache) {
      console.log(`[TIMELINE-AI GET] No cache for ${mode}`)
      return new Response(
        JSON.stringify({ error: 'No cache found', cached: false, expired: true }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Check cache age
    const { isValid, isStale, ageMinutes } = getCacheStatus(cache.updated_at)
    
    console.log(`[TIMELINE-AI GET] Cache ${mode}: ${ageMinutes}min old, valid=${isValid}, stale=${isStale}`)
    
    // If cache is too old (>4h), mark as expired
    if (!isValid) {
      console.log(`[TIMELINE-AI GET] Cache expired (>${CACHE_MAX_AGE_HOURS}h), returning with expired=true`)
      return new Response(
        JSON.stringify({
          cached: true,
          expired: true,
          stale: true,
          events: cache.events,
          eventCount: cache.event_count,
          dateRangeStart: cache.date_range_start,
          dateRangeEnd: cache.date_range_end,
          updatedAt: cache.updated_at,
          cacheAgeMinutes: ageMinutes,
          metadata: cache.metadata
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    return new Response(
      JSON.stringify({
        cached: true,
        expired: false,
        stale: isStale,
        events: cache.events,
        eventCount: cache.event_count,
        dateRangeStart: cache.date_range_start,
        dateRangeEnd: cache.date_range_end,
        updatedAt: cache.updated_at,
        cacheAgeMinutes: ageMinutes,
        metadata: cache.metadata
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('[TIMELINE-AI GET] Error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch cache', cached: false, expired: true }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

