/**
 * Prediction Extraction API
 *
 * Extracts price predictions from chat messages with timeframes.
 *
 * ENDPOINTS:
 * - GET  /prediction/api/extract          → cached predictions (instant)
 * - POST /prediction/api/extract          → stream fresh AI extraction
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { z } from 'zod'

// ═══════════════════════════════════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════════════════════════════════

const PredictionSchema = z.object({
  id: z.string(),
  username: z.string(),
  avatar: z.string().optional(),
  originalText: z.string(),
  prediction: z.string().describe('Short prediction text (max 100 chars)'),
  targetPrice: z.number().nullable().describe('Target BTC price if mentioned'),
  direction: z.enum(['bullish', 'bearish', 'neutral']),
  timeframe: z.enum(['short', 'mid', 'long']).describe('short=days, mid=weeks, long=months/year'),
  targetDate: z.string().nullable().describe('ISO date when prediction should resolve'),
  targetDateText: z.string().describe('Human readable deadline: "this year", "next week", etc.'),
  confidence: z.enum(['low', 'medium', 'high']),
  priceAtPrediction: z.number().describe('BTC price when prediction was made'),
  timestamp: z.string().describe('When the prediction was made'),
  emoji: z.string().optional(),
})

const ExtractResponseSchema = z.object({
  predictions: z.array(PredictionSchema).min(5).max(30),
  summary: z.string().describe('Brief summary of overall sentiment and predictions'),
})

export type Prediction = z.infer<typeof PredictionSchema>

// ═══════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════

const EXTRACTION_PROMPT = `Du bist ein Experte für das Extrahieren von Preis-Vorhersagen aus Chat-Nachrichten.

## DEINE AUFGABE
Finde Nachrichten die ZEITBASIERTE VORHERSAGEN über den Bitcoin-Preis machen.
Das sind Wetten die man überprüfen kann: "X wird bis DATUM passieren".

## ⛔ IGNORIEREN
- Nachrichten die mit "//" beginnen (sind Spieltipps)
- Allgemeine Meinungen ohne Zeitbezug ("Bitcoin wird steigen")
- Fragen ohne Behauptung ("Denkt ihr wir sehen 100k?")

## ✅ EXTRAHIEREN
- "100k dieses Jahr" → Zeitbasierte Vorhersage
- "Wir sehen 96k nicht mehr in 2025" → Zeitbasierte Vorhersage  
- "Nächste Woche 120k" → Zeitbasierte Vorhersage
- "Bis Weihnachten 150k" → Zeitbasierte Vorhersage
- "EOY 200k" → Zeitbasierte Vorhersage (End of Year)
- "Q1 2026 ATH" → Zeitbasierte Vorhersage

## TIMEFRAME KATEGORIEN
**short** (🔥 Kurzfristig): "heute", "morgen", "diese Woche", "nächste Woche" — Deadline innerhalb von 14 Tagen
**mid** (📊 Mittelfristig): "diesen Monat", "nächsten Monat", "in 2 Wochen" — Deadline 2 Wochen bis 2 Monate
**long** (🎯 Langfristig): "dieses Jahr", "2025", "EOY", "Q1/Q2/Q3/Q4", "bis Sommer/Weihnachten" — Deadline über 2 Monate

## DIRECTION
- **bullish**: Preis steigt, ATH, Pump, Moon
- **bearish**: Preis fällt, Dump, Crash, unter X
- **neutral**: Seitwärts, Range, "hält sich bei X"

## CONFIDENCE
- **high**: "DEFINITIV", "100%", "ich schwöre"
- **medium**: Normal, einfache Behauptung
- **low**: "vielleicht", "könnte sein", "ich glaube"

## TARGET DATE
Berechne das targetDate als ISO String:
- "dieses Jahr" → 2025-12-31
- "EOY" → 2025-12-31
- "nächste Woche" → 7 Tage von heute
- "diesen Monat" → Ende des aktuellen Monats
- "Q1 2026" → 2026-03-31

## FORMAT
Extrahiere 15-30 Vorhersagen, priorisiere:
1. Klare Zeitangaben
2. Konkrete Preistargets
3. Hohe Confidence
4. Interessante/kontroverse Takes

## ⚠️ KRITISCH: ZEITLICHE VERTEILUNG!
Du MUSST Vorhersagen aus JEDEM Tag des 7-Tage-Zeitraums finden!
- Mindestens 2-3 Vorhersagen pro Tag
- MAXIMAL 5 Vorhersagen vom gleichen Tag
- Verteile die Vorhersagen über die GESAMTE Woche

Gib auch eine kurze Summary mit dem generellen Sentiment.`

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

const CACHE_KEY = 'predictions-7d'
const CACHE_TTL_MINUTES = 60 // return stale after 1h but always show something

function isCacheValid(updatedAt: string, ttlMinutes = CACHE_TTL_MINUTES): boolean {
  const diffMinutes = (Date.now() - new Date(updatedAt).getTime()) / 60000
  console.log(`[PREDICTIONS] Cache age: ${Math.round(diffMinutes)}min (TTL: ${ttlMinutes}min)`)
  return diffMinutes < ttlMinutes
}

interface ChatMessage {
  username: string
  text: string
  time: string
}

async function fetchAllMessages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  startDate: Date,
  endDate: Date
): Promise<ChatMessage[]> {
  const allMessages: ChatMessage[] = []
  let lastTime: string | null = null
  let batchCount = 0
  const BATCH_SIZE = 1000
  const MAX_BATCHES = 10

  while (batchCount < MAX_BATCHES) {
    let query = supabase
      .from('tv_chat_messages')
      .select('username, text, time')
      .gte('time', startDate.toISOString())
      .lte('time', endDate.toISOString())
      .not('text', 'is', null)
      .order('time', { ascending: true })
      .limit(BATCH_SIZE)

    if (lastTime) {
      query = query.gt('time', lastTime)
    }

    const { data: batch, error } = await query

    if (error) {
      console.error('[PREDICTIONS] Batch fetch error:', error)
      break
    }

    if (!batch || batch.length === 0) break

    allMessages.push(...(batch as ChatMessage[]))
    lastTime = batch[batch.length - 1].time
    batchCount++

    console.log(`[PREDICTIONS] Batch ${batchCount}: ${batch.length} msgs (total: ${allMessages.length})`)

    if (batch.length < BATCH_SIZE) break
  }

  return allMessages.filter((m) => m.text?.trim().length > 1)
}

// ═══════════════════════════════════════════════════════════════════════
// GET — return cached predictions instantly
// ═══════════════════════════════════════════════════════════════════════

export async function GET() {
  const supabase = await createClient()

  try {
    const { data: cached, error } = await supabase
      .from('prediction_analysis_cache')
      .select('data, updated_at')
      .eq('cache_key', CACHE_KEY)
      .single()

    if (error) {
      console.log('[PREDICTIONS GET] No cache row:', error.message)
      return NextResponse.json({ cached: false, predictions: [], summary: '' })
    }

    if (!cached?.data) {
      console.log('[PREDICTIONS GET] Cache row has no data')
      return NextResponse.json({ cached: false, predictions: [], summary: '' })
    }

    // Always return whatever is cached (stale or not) — page shows it immediately
    const stale = !isCacheValid(cached.updated_at)
    console.log(`[PREDICTIONS GET] Returning ${stale ? 'stale' : 'fresh'} cache (${(cached.data as any).predictions?.length} predictions)`)

    return NextResponse.json({
      cached: true,
      stale,
      fetchedAt: cached.updated_at,
      predictions: (cached.data as any).predictions ?? [],
      summary: (cached.data as any).summary ?? '',
    })
  } catch (err) {
    console.error('[PREDICTIONS GET] Error:', err)
    return NextResponse.json({ cached: false, predictions: [], summary: '' })
  }
}

// ═══════════════════════════════════════════════════════════════════════
// POST — stream fresh AI extraction
// ═══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 7)

  // Fetch ALL messages with pagination
  const messages = await fetchAllMessages(supabase, startDate, endDate)

  if (messages.length === 0) {
    return NextResponse.json({ error: 'Keine Nachrichten gefunden' }, { status: 404 })
  }

  console.log(`[PREDICTIONS POST] ${messages.length} messages fetched, starting stream...`)

  // Get current BTC price
  let currentPrice = 85000
  try {
    const priceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', {
      cache: 'no-store',
    })
    const priceData = await priceRes.json()
    currentPrice = priceData.bitcoin?.usd || currentPrice
  } catch { /* use fallback */ }

  // Format messages — sample evenly across the week to stay within context limits
  // Take up to 60 messages per day (7 days × 60 = 420 messages max for prompt)
  const messagesByDay = new Map<string, ChatMessage[]>()
  for (const msg of messages) {
    const day = msg.time.split('T')[0]
    if (!messagesByDay.has(day)) messagesByDay.set(day, [])
    messagesByDay.get(day)!.push(msg)
  }

  const sampledMessages: ChatMessage[] = []
  for (const [, dayMsgs] of messagesByDay) {
    // Evenly sample up to 60 per day
    const step = Math.max(1, Math.floor(dayMsgs.length / 60))
    for (let i = 0; i < dayMsgs.length; i += step) {
      sampledMessages.push(dayMsgs[i])
      if (sampledMessages.length >= 420) break
    }
  }

  const chatContext = sampledMessages
    .map((msg) => {
      const d = new Date(msg.time)
      const dateStr = d.toISOString().split('T')[0]
      const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
      return `[${dateStr} ${time}] @${msg.username}: ${msg.text}`
    })
    .join('\n')

  const result = streamObject({
    model: openai('gpt-5.2'),
    schema: ExtractResponseSchema,
    system: EXTRACTION_PROMPT,
    prompt: `Aktueller BTC Preis: $${currentPrice.toLocaleString()}
Heutiges Datum: ${endDate.toISOString().split('T')[0]}
Zeitraum: ${startDate.toISOString().split('T')[0]} bis ${endDate.toISOString().split('T')[0]}
Nachrichten analysiert: ${messages.length} (Stichprobe: ${sampledMessages.length})

⚠️ WICHTIG: Das Feld "timestamp" MUSS exakt dem Zeitstempel der Nachricht entsprechen (z.B. "[2026-02-28 14:35]" → "2026-02-28T14:35:00Z").
Verwende NIEMALS ein Datum außerhalb des Zeitraums ${startDate.toISOString().split('T')[0]} bis ${endDate.toISOString().split('T')[0]}!

Extrahiere zeitbasierte Preis-Vorhersagen aus diesem Chat:

${chatContext}

Finde 15-25 konkrete Vorhersagen mit Zeitzielen, verteilt über die gesamte Woche.`,
    onFinish: async ({ object }) => {
      if (!object) return
      try {
        await supabase.from('prediction_analysis_cache').upsert({
          cache_key: CACHE_KEY,
          data: object,
          prediction_count: object.predictions?.length ?? 0,
          message_count: messages.length,
          current_price: currentPrice,
          date_range_start: startDate.toISOString().split('T')[0],
          date_range_end: endDate.toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
        }, { onConflict: 'cache_key' })
        console.log(`[PREDICTIONS] Cached ${object.predictions?.length} predictions`)
      } catch (err) {
        console.error('[PREDICTIONS] Cache save error:', err)
      }
    },
  })

  return result.toTextStreamResponse()
}
