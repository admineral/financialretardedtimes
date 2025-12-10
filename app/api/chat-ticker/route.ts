/**
 * route.ts (Chat Ticker API)
 * 
 * AI-powered ticker event extraction for the live chat ticker.
 * Extracts the most interesting, funny, and notable moments from the last 24h.
 * 
 * ENDPOINT: 
 * - GET /api/chat-ticker - Get cached ticker (auto-refresh if stale)
 * - POST /api/chat-ticker - Force generate new ticker
 * 
 * CACHING: Uses Supabase chat_timeline_cache with key 'ticker-24h'
 * Cache is valid for 1 hour, auto-refreshes if older
 */

import { NextResponse, after } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { z } from 'zod'

// ═══════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════

const CACHE_KEY = 'ticker-24h'
const CACHE_MAX_AGE_MINUTES = 240 // Cache valid for 4 hours

// ═══════════════════════════════════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════════════════════════════════

// Schema for AI generation (without id - we add it programmatically)
const AITickerEventSchema = z.object({
  date: z.string().describe('Datum im Format YYYY-MM-DD'),
  time: z.string().describe('Uhrzeit (HH:MM)'),
  username: z.string().describe('Exakter Username aus dem Chat'),
  text: z.string().max(80).describe('Kurze Zusammenfassung/Preview (max 80 Zeichen)'),
  type: z.enum(['bullish', 'bearish', 'funny', 'drama', 'insight', 'call', 'fail']),
  emoji: z.string().optional().describe('Passendes Emoji'),
  label: z.string().max(6).optional().describe('Kurzes Label wie "BTC", "ETH", "PUMP", "REKT" (max 6 Zeichen)'),
  headline: z.string().max(50).optional().describe('Lustige/catchy Überschrift für das Event (max 50 Zeichen)'),
  quote: z.string().optional().describe('Das vollständige Original-Zitat aus dem Chat'),
  quoteAuthor: z.string().optional().describe('Autor des Zitats falls abweichend vom username'),
})

const AITickerResponseSchema = z.object({
  events: z.array(AITickerEventSchema).min(10).max(30).describe('10-30 Ticker-Events, chronologisch'),
})

// Full schema with id (for storage/frontend)
const TickerEventSchema = AITickerEventSchema.extend({
  id: z.string(),
})

type TickerEvent = z.infer<typeof TickerEventSchema>

// ═══════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════

const TICKER_PROMPT = `Du bist ein Chat-Ticker-Kurator für "Financial Retarded Times".

## DEINE AUFGABE
Extrahiere die UNTERHALTSAMSTEN und INTERESSANTESTEN Momente aus dem Chat.
Wie ein Börsen-Ticker, aber für Chat-Highlights! 🎢

## ⛔ IGNORIEREN - ABSOLUT VERBOTEN!
Nachrichten die mit "//" und einem Preis beginnen (z.B. //88.5k, //95000) sind 
SPIELTIPPS - diese NIEMALS in den Ticker aufnehmen!

## EVENT-TYPEN

🚀 **bullish**: Optimistische Calls, Kaufsignale, "to the moon", FOMO
📉 **bearish**: Pessimistische Calls, Verkaufssignale, Doom & Gloom  
😂 **funny**: Lustige Sprüche, Witze, Fails, Comedy Gold
🍿 **drama**: Beef, Streit, heiße Takes, Kontroversen
💡 **insight**: Gute Analysen, smarte Beobachtungen, AHA-Momente
📢 **call**: Konkrete Preisprognosen, Calls (Long/Short Ansagen)
💀 **fail**: Komplett falsch gelegen, Bad Takes, Timing-Fails

## FORMAT

- **date**: Datum im Format "YYYY-MM-DD" (exaktes Datum der Nachricht)
- **time**: Nur Uhrzeit "HH:MM"
- **username**: Exakter Username aus dem Chat
- **text**: Kurze Zusammenfassung (max 80 Zeichen) - was ist passiert?
- **emoji**: Ein passendes Emoji (optional)
- **label**: Kurzes Label wie "BTC", "ETH", "PUMP", "REKT", "LOL" (max 6 Zeichen)
- **headline**: LUSTIGE/CATCHY Überschrift! Clickbait-Style, max 50 Zeichen. 
  Beispiele: "Besen-Wette eskaliert 🧹", "Der ewige Optimist strikes again", "Timing-Fail des Tages"
- **quote**: Das VOLLSTÄNDIGE Original-Zitat aus dem Chat (wörtlich!)
- **quoteAuthor**: Autor des Zitats (falls abweichend vom username)

## REGELN

1. **HEADLINE PFLICHT**: Jedes Event MUSS eine lustige headline haben!
2. **UNTERHALTSAM**: Die headline soll zum Schmunzeln bringen
3. **QUOTE WICHTIG**: Das volle Zitat als Beleg - wörtlich aus dem Chat!
4. **LABEL**: Kurz und knackig - BTC, ETH, PUMP, DIP, LOL, BEEF, etc.
5. **VIELFALT**: Mix aus allen Event-Typen
6. **CHRONOLOGISCH**: Events nach Zeit sortieren (älteste zuerst)
7. **KEINE TIPPS**: //88.5k und ähnliche Preistipps IGNORIEREN!
8. **DATUM**: Achte auf das korrekte Datum jeder Nachricht!

## BEISPIELE

✅ GUT:
{ 
  date: "2025-12-06", time: "09:15", username: "daxta", 
  text: "Geht ALL-IN mit Leverage", 
  type: "call", 
  label: "BTC",
  headline: "YOLO-King schlägt wieder zu 🎰",
  quote: "LONG JETZT! 10x Leverage, das ist der Boden, ich spür das!",
  emoji: "🎯" 
}
{ 
  date: "2025-12-06", time: "11:45", username: "royal_x", 
  text: "Macht wilde Wette über Support-Level", 
  type: "funny", 
  label: "LOL",
  headline: "Besen-Essen bei Support-Break? 🧹",
  quote: "Wenn das nicht hält, fress ich einen Besen, ich schwör auf alles",
  emoji: "🧹" 
}
{ 
  date: "2025-12-07", time: "15:00", username: "matze", 
  text: "Verkaufte direkt vor dem Pump", 
  type: "fail", 
  label: "REKT",
  headline: "Der klassische Boden-Verkäufer 💀",
  quote: "Hab bei 95k alles verkauft, endlich raus... wait was"
}

❌ SCHLECHT:
- Keine headline
- Langweilige headline: "User macht Call"
- Kein quote
- Tipps: "//88.5k" (VERBOTEN!)

Erstelle 15-25 Ticker-Events, priorisiere UNTERHALTUNG und LUSTIGE HEADLINES!`

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

interface CacheData {
  cache_key: string
  events: TickerEvent[]
  event_count: number
  date_range_start: string
  date_range_end: string
  updated_at: string
  metadata?: {
    messageCount: number
    uniqueUsers: number
  }
}

async function getCache(supabase: Awaited<ReturnType<typeof createClient>>): Promise<CacheData | null> {
  const { data, error } = await supabase
    .from('chat_timeline_cache')
    .select('*')
    .eq('cache_key', CACHE_KEY)
    .single()
  
  if (error || !data) return null
  return data as CacheData
}

async function saveCache(
  supabase: Awaited<ReturnType<typeof createClient>>,
  events: TickerEvent[],
  startDate: Date,
  endDate: Date,
  messageCount: number,
  uniqueUsers: number
): Promise<void> {
  const cacheData = {
    cache_key: CACHE_KEY,
    events,
    event_count: events.length,
    date_range_start: startDate.toISOString().split('T')[0],
    date_range_end: endDate.toISOString().split('T')[0],
    updated_at: new Date().toISOString(),
    metadata: {
      messageCount,
      uniqueUsers
    }
  }
  
  const { error } = await supabase
    .from('chat_timeline_cache')
    .upsert(cacheData, { onConflict: 'cache_key' })
  
  if (error) {
    console.error('[TICKER] ❌ Cache save error:', error.message)
  } else {
    console.log(`[TICKER] ✅ Cached ${events.length} events`)
  }
}

function isCacheValid(cache: CacheData): { valid: boolean; ageMinutes: number } {
  const cacheTime = new Date(cache.updated_at).getTime()
  const now = Date.now()
  const ageMinutes = Math.floor((now - cacheTime) / 60000)
  
  return {
    valid: ageMinutes < CACHE_MAX_AGE_MINUTES,
    ageMinutes
  }
}

interface ChatMessage {
  username: string
  text: string
  time: string
}

async function fetchChatMessages(supabase: Awaited<ReturnType<typeof createClient>>): Promise<{
  messages: ChatMessage[]
  uniqueUsers: number
  startDate: Date
  endDate: Date
}> {
  // Get last 24 hours
  const endDate = new Date()
  const startDate = new Date()
  startDate.setHours(startDate.getHours() - 24)
  
  console.log(`[TICKER] 📅 Fetching: ${startDate.toISOString()} → ${endDate.toISOString()}`)
  
  // Fetch messages
  const { data: messages, error } = await supabase
    .from('tv_chat_messages')
    .select('username, text, time')
    .gte('time', startDate.toISOString())
    .lte('time', endDate.toISOString())
    .order('time', { ascending: true })
    .limit(500)
  
  if (error) throw new Error(`Database error: ${error.message}`)
  
  const messageList = messages || []
  const uniqueUsers = new Set(messageList.map(m => m.username)).size
  
  console.log(`[TICKER] 📊 Messages: ${messageList.length}, Users: ${uniqueUsers}`)
  
  return { messages: messageList, uniqueUsers, startDate, endDate }
}

function formatChatForAI(messages: ChatMessage[]): string {
  return messages.map(msg => {
    const msgDate = new Date(msg.time)
    const dateStr = msgDate.toISOString().split('T')[0] // YYYY-MM-DD
    const time = msgDate.toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'
    })
    return `[${dateStr} ${time}] @${msg.username}: ${msg.text}`
  }).join('\n')
}

// ═══════════════════════════════════════════════════════════════════════
// GET HANDLER - Returns cached data only (client should POST for refresh)
// ═══════════════════════════════════════════════════════════════════════

export async function GET() {
  await headers()
  
  try {
    const supabase = await createClient()
    
    console.log(`[TICKER GET] ════════════════════════════════════════════`)
    console.log(`[TICKER GET] 🔍 Checking cache...`)
    
    const cache = await getCache(supabase)
    
    if (cache && cache.events && cache.events.length > 0) {
      const { valid, ageMinutes } = isCacheValid(cache)
      
      console.log(`[TICKER GET] ✅ Cache found: ${cache.event_count} events, ${ageMinutes}min old, valid=${valid}`)
      
      if (valid) {
        return NextResponse.json({
          events: cache.events,
          eventCount: cache.event_count,
          cached: true,
          updatedAt: cache.updated_at,
          cacheAgeMinutes: ageMinutes
        })
      }
      
      // Cache stale - return stale data, client should call POST to refresh
      console.log(`[TICKER GET] ⚠️ Cache stale (${ageMinutes}min), returning stale data`)
      
      return NextResponse.json({
        events: cache.events,
        eventCount: cache.event_count,
        cached: true,
        stale: true,
        updatedAt: cache.updated_at,
        cacheAgeMinutes: ageMinutes
      })
    }
    
    // No cache - return empty, client should call POST
    console.log(`[TICKER GET] 📭 No cache found, client should POST`)
    
    return NextResponse.json({
      events: [],
      eventCount: 0,
      cached: false,
      needsGeneration: true,
      updatedAt: null
    })
    
  } catch (error) {
    console.error('[TICKER GET] ❌ Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error', events: [] },
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════
// POST HANDLER - Force generate new ticker (streaming)
// ═══════════════════════════════════════════════════════════════════════

export async function POST() {
  await headers()
  
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
  
  try {
    const supabase = await createClient()
    
    console.log(`[TICKER POST] ════════════════════════════════════════════`)
    console.log(`[TICKER POST] 🔄 Streaming new ticker generation...`)
    
    const { messages, uniqueUsers, startDate, endDate } = await fetchChatMessages(supabase)
    
    if (messages.length === 0) {
      return new Response(
        JSON.stringify({ events: [], eventCount: 0, error: 'No messages found' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    const chatContext = formatChatForAI(messages)
    
    // Stream AI response with onFinish for caching
    // Use after() to ensure cache save completes on serverless (Vercel)
    const result = streamObject({
      model: openai('gpt-5.1'),
      schema: AITickerResponseSchema,
      system: TICKER_PROMPT,
      prompt: `Extrahiere die unterhaltsamsten Ticker-Events aus diesem Chat (letzte 24h):

${chatContext}

## WICHTIG:
1. Jedes Event MUSS eine lustige "headline" haben!
2. Jedes Event MUSS das vollständige "quote" enthalten!
3. Verwende passende "label" (BTC, ETH, PUMP, DIP, LOL, BEEF, REKT, etc.)
4. Sortiere chronologisch (älteste zuerst)
5. Verwende das exakte Datum (YYYY-MM-DD) aus den Nachrichten!

Erstelle 15-25 Events. Priorisiere: Lustige Headlines, Drama, krasse Calls, Fails.`,
      // Note: temperature not supported for reasoning models like gpt-5.1
      onFinish: async ({ object }) => {
        // Use after() to keep serverless function alive until cache save completes
        // This is critical for Vercel deployments where the function might terminate
        // after the streaming response is sent but before onFinish completes
        after(async () => {
          if (object && object.events && object.events.length > 0) {
            console.log(`[TICKER POST] ✅ Stream complete: ${object.events.length} events`)
            
            // Add unique IDs to each event
            const eventsWithIds: TickerEvent[] = object.events.map((event, index) => ({
              ...event,
              id: `${event.date}-${event.time.replace(':', '')}-${index}`,
            }))
            
            try {
              // Create a fresh supabase client for the after() context
              const afterSupabase = await createClient()
              await saveCache(afterSupabase, eventsWithIds, startDate, endDate, messages.length, uniqueUsers)
              console.log(`[TICKER POST] 💾 Cached ${eventsWithIds.length} events`)
            } catch (cacheError) {
              console.error(`[TICKER POST] ⚠️ Cache error:`, cacheError)
            }
          }
        })
      }
    })
    
    // Return streaming response
    return result.toTextStreamResponse()
    
  } catch (error) {
    console.error('[TICKER POST] ❌ Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
