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

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'

// ═══════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════

const CACHE_KEY = 'ticker-24h'
const CACHE_MAX_AGE_MINUTES = 60 // Cache valid for 1 hour

// ═══════════════════════════════════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════════════════════════════════

const TickerEventSchema = z.object({
  id: z.string(),
  date: z.string().describe('Datum im Format YYYY-MM-DD'),
  time: z.string().describe('Uhrzeit (HH:MM)'),
  username: z.string(),
  text: z.string().max(100).describe('Kurzer, knackiger Text (max 100 Zeichen)'),
  type: z.enum(['bullish', 'bearish', 'funny', 'drama', 'insight', 'call', 'fail']),
  emoji: z.string().optional().describe('Passendes Emoji'),
})

const TickerResponseSchema = z.object({
  events: z.array(TickerEventSchema).min(10).max(30).describe('10-30 Ticker-Events, chronologisch'),
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
- **text**: KURZ! Max 100 Zeichen. Kernaussage oder witzigster Teil.
- **emoji**: Ein passendes Emoji (optional, wenn besonders lustig/krass)

## REGELN

1. **UNTERHALTSAM**: Wähle die lustigsten, krassesten, interessantesten Momente
2. **VIELFALT**: Mix aus allen Event-Typen, nicht nur bullish/bearish
3. **KURZ**: Ticker-Texte müssen scanbar sein - max 100 Zeichen!
4. **CHRONOLOGISCH**: Events nach Zeit sortieren (älteste zuerst)
5. **KEINE TIPPS**: //88.5k und ähnliche Preistipps IGNORIEREN!
6. **HUMOR**: Funny moments besonders hervorheben - die Community liebt das!
7. **DATUM**: Achte auf das korrekte Datum jeder Nachricht!

## BEISPIELE

✅ GUT:
{ date: "2025-12-06", time: "09:15", username: "daxta", text: "LONG JETZT! 🚀", type: "call", emoji: "🎯" }
{ date: "2025-12-06", time: "10:23", username: "kultr", text: "Das war der Boden, ich schwöre!", type: "bullish" }
{ date: "2025-12-06", time: "11:45", username: "royal_x", text: "Wenn das hält, fress ich einen Besen", type: "funny", emoji: "🧹" }
{ date: "2025-12-07", time: "14:30", username: "nasdachs", text: "RSI Divergenz auf 4H - aufpassen!", type: "insight", emoji: "💡" }
{ date: "2025-12-07", time: "15:00", username: "matze", text: "Hab bei 95k verkauft... pain", type: "fail", emoji: "💀" }

❌ SCHLECHT:
- Zu lang: "Also ich denke ja dass der Preis wahrscheinlich in den nächsten Tagen..."
- Langweilig: "Guten Morgen", "Hi", "Was geht?"
- Tipps: "//88.5k" (VERBOTEN!)

Erstelle 15-25 Ticker-Events, priorisiere UNTERHALTUNG über alles!`

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

async function generateTickerEvents(supabase: Awaited<ReturnType<typeof createClient>>): Promise<{
  events: TickerEvent[]
  messageCount: number
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
  
  if (!messages || messages.length === 0) {
    return { events: [], messageCount: 0, uniqueUsers: 0, startDate, endDate }
  }
  
  // Format for AI - include date and time
  const chatContext = messages.map(msg => {
    const msgDate = new Date(msg.time)
    const dateStr = msgDate.toISOString().split('T')[0] // YYYY-MM-DD
    const time = msgDate.toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'
    })
    return `[${dateStr} ${time}] @${msg.username}: ${msg.text}`
  }).join('\n')
  
  const uniqueUsers = new Set(messages.map(m => m.username)).size
  
  console.log(`[TICKER] 📊 Messages: ${messages.length}, Users: ${uniqueUsers}`)
  
  // Generate with AI
  const result = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: TickerResponseSchema,
    system: TICKER_PROMPT,
    prompt: `Extrahiere die unterhaltsamsten Ticker-Events aus diesem Chat (letzte 24h):

${chatContext}

Erstelle 15-25 Events. Priorisiere: Lustige Momente, Drama, krasse Calls, Fails.
Sortiere chronologisch (älteste zuerst).
WICHTIG: Verwende das exakte Datum (YYYY-MM-DD) aus den Nachrichten!`,
    temperature: 0.8,
  })
  
  return {
    events: result.object.events,
    messageCount: messages.length,
    uniqueUsers,
    startDate,
    endDate
  }
}

// ═══════════════════════════════════════════════════════════════════════
// GET HANDLER - Returns cached data, auto-refreshes if stale
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
      
      // Cache stale - return stale data but trigger refresh
      console.log(`[TICKER GET] ⚠️ Cache stale (${ageMinutes}min), returning stale + will refresh`)
      
      return NextResponse.json({
        events: cache.events,
        eventCount: cache.event_count,
        cached: true,
        stale: true,
        updatedAt: cache.updated_at,
        cacheAgeMinutes: ageMinutes
      })
    }
    
    // No cache - generate new
    console.log(`[TICKER GET] 📝 No cache found, generating...`)
    
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured', events: [] }, { status: 500 })
    }
    
    const { events, messageCount, uniqueUsers, startDate, endDate } = await generateTickerEvents(supabase)
    
    if (events.length > 0) {
      await saveCache(supabase, events, startDate, endDate, messageCount, uniqueUsers)
    }
    
    console.log(`[TICKER GET] ✅ Generated ${events.length} events`)
    
    return NextResponse.json({
      events,
      eventCount: events.length,
      cached: false,
      updatedAt: new Date().toISOString()
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
// POST HANDLER - Force generate new ticker
// ═══════════════════════════════════════════════════════════════════════

export async function POST() {
  await headers()
  
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
  }
  
  try {
    const supabase = await createClient()
    
    console.log(`[TICKER POST] ════════════════════════════════════════════`)
    console.log(`[TICKER POST] 🔄 Force generating new ticker...`)
    
    const { events, messageCount, uniqueUsers, startDate, endDate } = await generateTickerEvents(supabase)
    
    if (events.length > 0) {
      await saveCache(supabase, events, startDate, endDate, messageCount, uniqueUsers)
    }
    
    console.log(`[TICKER POST] ✅ Generated ${events.length} events`)
    
    return NextResponse.json({
      events,
      eventCount: events.length,
      cached: false,
      updatedAt: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('[TICKER POST] ❌ Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
