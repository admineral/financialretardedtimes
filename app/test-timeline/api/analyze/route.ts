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
  timestamp: z.string().optional().describe('Exakter Zeitstempel aus dem Chat (ISO format oder DD.MM HH:MM)'),
  time: z.string().describe('Uhrzeit für Anzeige (HH:MM format)'),
  date: z.string().describe('Datum (YYYY-MM-DD format)'),
  label: z.string().max(12).describe('Kurzes Label (2-12 Zeichen) wie: BTC, ETH, CALL, LOL, BEEF, PUMP, DUMP, RIP, FOMO, TA, NEWS, ALPHA'),
  title: z.string().max(50).describe('Prägnante Überschrift (max 50 Zeichen)'),
  quote: z.string().optional().describe('Das beste Zitat zu diesem Event (max 100 Zeichen)'),
  quoteAuthor: z.string().optional().describe('Username des Zitierten'),
  description: z.string().optional().describe('Kurze Beschreibung (max 150 Zeichen)'),
  type: z.enum(['discussion', 'prediction', 'drama', 'insight', 'milestone', 'humor']).describe('Event-Typ für Farbe'),
  participants: z.array(z.string()).optional().describe('Beteiligte User (1-6)'),
  sentiment: z.enum(['bullish', 'bearish', 'neutral', 'mixed']).optional().describe('Sentiment'),
})

const TimelineResponseSchema = z.object({
  events: z.array(TimelineEventSchema).describe('Die wichtigsten Events - MINDESTENS 5-6 bei normaler Aktivität, bis zu 12-15 bei hoher!'),
  summary: z.string().optional().describe('Ein-Satz-Zusammenfassung des Zeitraums (max 200 Zeichen)'),
  activityLevel: z.enum(['low', 'medium', 'high']).optional().describe('Wie aktiv war der Chat?'),
  dominantSentiment: z.enum(['bullish', 'bearish', 'neutral', 'mixed']).optional().describe('Dominantes Sentiment'),
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

## 📊 BAR CHART → TEXTBOXEN

Die Timeline zeigt ein Balkendiagramm mit Chat-Aktivität pro Zeitslot.
**Du bekommst eine Liste von Zeitslots - für JEDEN sollst du ein Event generieren!**

### Deine Aufgabe:
1. Du bekommst Zeitslots mit Aktivität (z.B. "Sa 14:00: 47 msgs")
2. Für JEDEN Zeitslot: Suche im Chat nach Nachrichten aus diesem Zeitfenster
3. Finde das interessanteste/lustigste/wichtigste aus diesem Slot
4. Generiere dafür ein Event mit korrektem Timestamp

### Beispiel:
Zeitslot: "Sa 14:00 (32 msgs)"
→ Suche Nachrichten zwischen 14:00-15:00 am Samstag
→ Finde z.B. eine spannende Diskussion über BTC
→ Generiere Event mit time: "14:23", date: "2024-12-07"

**WICHTIG**: Die Anzahl Events sollte ungefähr der Anzahl gelisteter Zeitslots entsprechen!

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
3. **MEHR IST BESSER**: Lieber mehr Events als zu wenig! Die Timeline soll voll aussehen!
4. **CHRONOLOGISCH**: Events zeitlich verteilen über den gesamten Zeitraum
5. **VIELFALT**: Verschiedene Event-Typen mischen - nicht nur discussions!
6. **KLEINIGKEITEN ZÄHLEN**: Auch kleine lustige Momente, kurze Calls, witzige Kommentare sind Events!
7. **PEAK-FOKUS**: In Peak-Stunden IMMER nach Events suchen - dort passiert am meisten!

## FORMAT

- timestamp: Der echte Zeitstempel (z.B. "2024-12-07T10:23:00" oder aus dem Chat)
- time: Nur die Uhrzeit für Anzeige (z.B. "10:23")
- date: Nur das Datum (z.B. "2024-12-07")
- **label**: KURZES Tag (2-12 Zeichen) - sei kreativ! z.B.:
  - Coins: "BTC", "ETH", "SOL", "XRP"
  - Calls: "LONG", "SHORT", "PUMP", "DUMP"
  - Reaktionen: "LOL", "RIP", "FOMO", "REKT"
  - Themen: "TA", "NEWS", "ALPHA", "BEEF"
  - Oder custom: "100K?", "MOON", "DIP", "TOP"
- title: Prägnante Überschrift (max 50 Zeichen)
- quote: Ein echtes Zitat aus dem Chat, mit @username wenn sinnvoll
- quoteAuthor: Wer hat das gesagt?

## ⚠️ ANZAHL EVENTS - WICHTIG!

SEI NICHT ZU KONSERVATIV! Gib lieber mehr Events als zu wenig:

- **low** (< 30 Nachrichten, z.B. früh morgens): 3-5 Events
- **medium** (30-150 Nachrichten): 6-10 Events  
- **high** (> 150 Nachrichten): 10-15 Events

Jede halbwegs interessante Nachricht kann ein Event sein!
Calls, Witze, Analysen, Reaktionen, Drama - ALLES zählt!

Bei 7d-Mode: Verteile Events über ALLE Tage, nicht nur die letzten!`

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

// Types for activity data
interface ActivityBucket {
  timestamp: string
  label: string
  count: number
  uniqueUsers: number
  intensity: number
}

interface ActivityStats {
  totalMessages: number
  totalUsers: number
  maxPerBucket: number
  peakTime: string
}

/**
 * Get significant buckets (peaks) that need event coverage
 * Returns buckets with above-average activity
 */
function getSignificantBuckets(buckets: ActivityBucket[], topN: number = 10): ActivityBucket[] {
  if (!buckets || buckets.length === 0) return []
  
  const nonEmpty = buckets.filter(b => b.count > 0)
  if (nonEmpty.length === 0) return []
  
  const avgCount = nonEmpty.reduce((sum, b) => sum + b.count, 0) / nonEmpty.length
  
  // Get buckets with above-average activity, sorted by count
  return nonEmpty
    .filter(b => b.count >= avgCount * 0.5) // At least 50% of average
    .sort((a, b) => b.count - a.count)
    .slice(0, topN)
}

/**
 * Format activity context for AI prompt - with specific buckets to fill
 */
function formatActivityContext(buckets: ActivityBucket[], stats: ActivityStats | null, mode: string): string {
  if (!buckets || buckets.length === 0) {
    return ''
  }
  
  const topN = mode === '7d' ? 12 : mode === '3d' ? 8 : 6
  const significantBuckets = getSignificantBuckets(buckets, topN)
  
  // Find the peak bucket
  const peakBucket = significantBuckets[0] // Already sorted by count
  const isPeakProvided = stats?.peakTime && peakBucket
  
  const lines: string[] = [
    '\n## 📊 BAR CHART - TEXTBOXEN GESUCHT!',
    '',
    'Die Timeline zeigt ein Balkendiagramm. **JEDER dieser Balken braucht eine Textbox (Event)!**',
    ''
  ]
  
  // Highlight peak time - MANDATORY event
  if (isPeakProvided) {
    const peakDate = new Date(peakBucket.timestamp)
    const peakDateStr = peakDate.toISOString().split('T')[0]
    const peakTimeStr = peakDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
    
    lines.push('### 🔥🔥🔥 PEAK HOUR - PFLICHT-EVENT! 🔥🔥🔥')
    lines.push('')
    lines.push(`**${peakBucket.label}** = HÖCHSTE AKTIVITÄT (${peakBucket.count} Nachrichten!)`)
    lines.push(`→ Zeitfenster: ${peakDateStr} ca. ${peakTimeStr}`)
    lines.push(`→ HIER MUSS UNBEDINGT EIN EVENT HER! Das ist der wichtigste Balken!`)
    lines.push('')
    lines.push('---')
    lines.push('')
  }
  
  lines.push('### 📝 DIESE ZEITSLOTS BRAUCHEN EINEN TEXT:')
  lines.push('')
  
  // List each bucket that needs an event
  for (let i = 0; i < significantBuckets.length; i++) {
    const bucket = significantBuckets[i]
    const date = new Date(bucket.timestamp)
    const dateStr = date.toISOString().split('T')[0]
    const timeStr = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
    
    const isPeak = bucket === peakBucket
    const prefix = isPeak ? '🔥 ' : ''
    const suffix = isPeak ? ' ← PEAK!' : ''
    
    lines.push(`${i + 1}. ${prefix}**${bucket.label}** (${bucket.count} msgs, ${bucket.uniqueUsers} user)${suffix}`)
    lines.push(`   → Zeitfenster: ${dateStr} ca. ${timeStr}`)
    lines.push(`   → SUCHE: Was wurde in diesem Zeitfenster besprochen?`)
    lines.push('')
  }
  
  lines.push('---')
  lines.push('⚠️ **AUFGABE**: Generiere für JEDEN dieser Zeitslots mindestens 1 Event!')
  lines.push('Suche im Chat nach Nachrichten aus diesen Zeitfenstern.')
  lines.push('Jeder Balken = 1 Textbox mit dem interessantesten Moment aus diesem Slot.')
  lines.push('')
  
  return lines.join('\n')
}

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
    const activityBuckets: ActivityBucket[] = body.activityBuckets || []
    const activityStats: ActivityStats | null = body.activityStats || null
    
    console.log(`[TIMELINE-AI POST] ════════════════════════════════════════════`)
    console.log(`[TIMELINE-AI POST] 🚀 Starting AI generation for mode: ${mode}`)
    console.log(`[TIMELINE-AI POST] 📊 Activity buckets provided: ${activityBuckets.length}`)
    console.log(`[TIMELINE-AI POST] 🔑 Will save to cache_key: timeline-${mode}`)
    
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
    
    // Determine expected event count based on activity - BE GENEROUS!
    let expectedEvents = '3-5'
    let activityHint = 'niedrig'
    if (allMessages.length > 150) {
      expectedEvents = '10-15'
      activityHint = 'hoch'
    } else if (allMessages.length > 30) {
      expectedEvents = '6-10'
      activityHint = 'mittel'
    }
    
    const currentTime = new Date().toLocaleString('de-DE', {
      hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
      timeZone: 'Europe/Berlin'
    })
    
    console.log(`[TIMELINE-AI] 📊 Messages: ${allMessages.length}`)
    console.log(`[TIMELINE-AI] 👥 Users: ${uniqueUsers}`)
    console.log(`[TIMELINE-AI] 🎯 Expected events: ${expectedEvents} (${activityHint})`)
    if (activityStats?.peakTime) {
      console.log(`[TIMELINE-AI] 🔥 Peak time: ${activityStats.peakTime} (${activityStats.maxPerBucket} msgs)`)
    }
    console.log(`[TIMELINE-AI] ════════════════════════════════════════════`)
    
    // Generate AI response (non-streaming for reliable caching)
    console.log(`[TIMELINE-AI] 🤖 Calling AI for ${mode}...`)
    
    // Build activity context if provided
    const activityContext = formatActivityContext(activityBuckets, activityStats, mode)
    
    // Build peak time info for prompt
    let peakInfo = ''
    if (activityStats?.peakTime) {
      const peakDate = new Date(activityStats.peakTime)
      const peakTimeStr = peakDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
      const peakDateStr = peakDate.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' })
      peakInfo = `\n🔥 PEAK-STUNDE: ${peakDateStr} ${peakTimeStr} (${activityStats.maxPerBucket} Nachrichten) - HIER MUSS EIN EVENT HER!\n`
    }
    
    const aiPrompt = `Aktueller Zeitpunkt: ${currentTime}
Zeitraum: ${mode === '24h' ? 'Letzte 24 Stunden' : mode === '3d' ? 'Letzte 3 Tage' : 'Letzte 7 Tage'}
Aktivität: ${activityHint} (${allMessages.length} Nachrichten von ${uniqueUsers} Usern)
${peakInfo}
═══════════════════════════════════════════════════════════
🎯 ERWARTETE EVENTS: ${expectedEvents} (${activityHint})
═══════════════════════════════════════════════════════════

Sei nicht zu konservativ - jeder halbwegs interessante Moment zählt!
${activityContext}
🎯 HAUPTAUFGABE: Für jeden oben gelisteten Zeitslot → 1 Event generieren!
Suche im Chat nach Nachrichten aus dem jeweiligen Zeitfenster und finde das Highlight.

${chatContext}`
    
    // Check if client wants streaming
    const wantsStream = request.headers.get('accept')?.includes('text/event-stream')
    
    console.log(`[TIMELINE-AI] 🤖 Generating for ${mode} (streaming: ${wantsStream})...`)
    
    // Use streamObject for real-time event streaming
    const result = streamObject({
      model: openai('gpt-5.1'),
      schema: TimelineResponseSchema,
      system: TIMELINE_PROMPT,
      prompt: aiPrompt,
      temperature: 0.7,
      onFinish: async ({ object }) => {
        // Save to cache when stream completes
        if (object && object.events && object.events.length > 0) {
          console.log(`[TIMELINE-AI] ✅ Stream complete: ${object.events.length} events`)
          try {
            const cacheData = {
              cache_key: `timeline-${mode}`,
              events: object.events,
              event_count: object.events.length,
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
            }
            
            await supabase
              .from('chat_timeline_cache')
              .upsert(cacheData, { onConflict: 'cache_key' })
            
            console.log(`[TIMELINE-AI] 💾 Cached ${object.events.length} events for ${mode}`)
          } catch (cacheError) {
            console.error(`[TIMELINE-AI] ⚠️ Cache error:`, cacheError)
          }
        }
      }
    })
    
    // Return streaming response
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
const CACHE_MAX_AGE_HOURS = 12 // Invalidate cache if older than 12 hours
const CACHE_STALE_HOURS = 4 // Consider stale after 4 hours (background refresh)

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
    isStale: ageHours > CACHE_STALE_HOURS,
    ageMinutes
  }
}

/**
 * GET - Return cached timeline analysis with cache age checking
 * 
 * Returns:
 * - cached: true if cache exists
 * - stale: true if cache is older than 4 hours (client should refresh in background)
 * - expired: true if cache is older than 12 hours (client must refresh)
 */
export async function GET(request: NextRequest) {
  await headers() // Ensure dynamic rendering
  
  try {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode') || '24h'
    const debug = searchParams.get('debug') === 'true'
    
    const supabase = await createClient()
    
    // Debug mode: list all cache entries
    if (debug) {
      console.log(`[TIMELINE-AI GET] 🔧 DEBUG: Listing all cache entries`)
      const { data: allCaches, error: listError } = await supabase
        .from('chat_timeline_cache')
        .select('cache_key, event_count, updated_at, date_range_start, date_range_end')
        .order('updated_at', { ascending: false })
      
      if (listError) {
        console.error(`[TIMELINE-AI GET] ❌ List error:`, listError.message)
      }
      
      return new Response(
        JSON.stringify({ 
          debug: true,
          cacheEntries: allCaches || [],
          count: allCaches?.length || 0
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    console.log(`[TIMELINE-AI GET] ════════════════════════════════════════════`)
    console.log(`[TIMELINE-AI GET] 🔍 Checking cache for mode: ${mode}`)
    console.log(`[TIMELINE-AI GET] 🔑 Cache key: timeline-${mode}`)
    
    const { data: cache, error } = await supabase
      .from('chat_timeline_cache')
      .select('*')
      .eq('cache_key', `timeline-${mode}`)
      .single()
    
    if (error) {
      console.log(`[TIMELINE-AI GET] ❌ DB Error for ${mode}:`, error.message, error.code, error.details)
    }
    
    if (error || !cache) {
      console.log(`[TIMELINE-AI GET] 📭 No cache found for ${mode}`)
      return new Response(
        JSON.stringify({ error: 'No cache found', cached: false, expired: true }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    console.log(`[TIMELINE-AI GET] ✅ Found cache for ${mode}:`, {
      eventCount: cache.event_count,
      updatedAt: cache.updated_at,
      dateRange: `${cache.date_range_start} → ${cache.date_range_end}`
    })
    
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

