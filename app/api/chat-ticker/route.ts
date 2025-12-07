/**
 * route.ts (Chat Ticker API)
 * 
 * AI-powered ticker event extraction for the live chat ticker.
 * Extracts the most interesting, funny, and notable moments from the last 24h.
 * 
 * ENDPOINT: POST /api/chat-ticker
 * 
 * RESPONSE: Streaming JSON with ticker events
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

const TickerEventSchema = z.object({
  id: z.string(),
  time: z.string().describe('Uhrzeit (HH:MM)'),
  username: z.string(),
  text: z.string().max(100).describe('Kurzer, knackiger Text (max 100 Zeichen)'),
  type: z.enum(['bullish', 'bearish', 'funny', 'drama', 'insight', 'call', 'fail']),
  emoji: z.string().optional().describe('Passendes Emoji'),
})

const TickerResponseSchema = z.object({
  events: z.array(TickerEventSchema).min(10).max(30).describe('10-30 Ticker-Events, chronologisch'),
})

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

## BEISPIELE

✅ GUT:
{ time: "09:15", username: "daxta", text: "LONG JETZT! 🚀", type: "call", emoji: "🎯" }
{ time: "10:23", username: "kultr", text: "Das war der Boden, ich schwöre!", type: "bullish" }
{ time: "11:45", username: "royal_x", text: "Wenn das hält, fress ich einen Besen", type: "funny", emoji: "🧹" }
{ time: "14:30", username: "nasdachs", text: "RSI Divergenz auf 4H - aufpassen!", type: "insight", emoji: "💡" }
{ time: "15:00", username: "matze", text: "Hab bei 95k verkauft... pain", type: "fail", emoji: "💀" }

❌ SCHLECHT:
- Zu lang: "Also ich denke ja dass der Preis wahrscheinlich in den nächsten Tagen..."
- Langweilig: "Guten Morgen", "Hi", "Was geht?"
- Tipps: "//88.5k" (VERBOTEN!)

Erstelle 15-25 Ticker-Events, priorisiere UNTERHALTUNG über alles!`

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
    const supabase = await createClient()
    
    // Get last 24 hours
    const endDate = new Date()
    const startDate = new Date()
    startDate.setHours(startDate.getHours() - 24)
    
    console.log(`[TICKER] ════════════════════════════════════════════`)
    console.log(`[TICKER] 📺 Generating ticker events`)
    console.log(`[TICKER] 📅 Last 24h: ${startDate.toISOString()} → ${endDate.toISOString()}`)
    
    // Fetch messages
    const { data: messages, error } = await supabase
      .from('tv_chat_messages')
      .select('username, text, time')
      .gte('time', startDate.toISOString())
      .lte('time', endDate.toISOString())
      .order('time', { ascending: true })
      .limit(500) // Limit for performance
    
    if (error) throw new Error(`Database error: ${error.message}`)
    
    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ events: [], error: 'No messages found' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Format for AI
    const chatContext = messages.map(msg => {
      const time = new Date(msg.time).toLocaleTimeString('de-DE', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'
      })
      return `[${time}] @${msg.username}: ${msg.text}`
    }).join('\n')
    
    const uniqueUsers = new Set(messages.map(m => m.username)).size
    
    console.log(`[TICKER] 📊 Messages: ${messages.length}, Users: ${uniqueUsers}`)
    console.log(`[TICKER] ════════════════════════════════════════════`)
    
    // Stream AI response
    const result = streamObject({
      model: openai('gpt-4o-mini'),
      schema: TickerResponseSchema,
      system: TICKER_PROMPT,
      prompt: `Extrahiere die unterhaltsamsten Ticker-Events aus diesem Chat (letzte 24h):

${chatContext}

Erstelle 15-25 Events. Priorisiere: Lustige Momente, Drama, krasse Calls, Fails.
Sortiere chronologisch (älteste zuerst).`,
      temperature: 0.8, // Higher for more creative/fun output
      onFinish: ({ object }) => {
        if (object?.events) {
          console.log(`[TICKER] ✅ Generated ${object.events.length} ticker events`)
        }
      }
    })
    
    return result.toTextStreamResponse()
    
  } catch (error) {
    console.error('[TICKER] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

