/**
 * Prediction Extraction API
 * 
 * Extracts price predictions from chat messages with timeframes.
 * Uses AI to identify predictions like "96k by end of year" or "100k next week".
 * 
 * ENDPOINT: GET /prediction/api/extract
 * RESPONSE: { predictions: Prediction[], cached: boolean, fetchedAt: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'

// ═══════════════════════════════════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════════════════════════════════

const PredictionSchema = z.object({
  id: z.string(),
  username: z.string(),
  avatar: z.string().optional(),
  originalText: z.string(),
  
  // Prediction details
  prediction: z.string().describe('Short prediction text (max 100 chars)'),
  targetPrice: z.number().nullable().describe('Target BTC price if mentioned'),
  direction: z.enum(['bullish', 'bearish', 'neutral']),
  
  // Time target
  timeframe: z.enum(['short', 'mid', 'long']).describe('short=days, mid=weeks, long=months/year'),
  targetDate: z.string().nullable().describe('ISO date when prediction should resolve'),
  targetDateText: z.string().describe('Human readable deadline: "this year", "next week", etc.'),
  
  // Context
  confidence: z.enum(['low', 'medium', 'high']),
  priceAtPrediction: z.number().describe('BTC price when prediction was made'),
  timestamp: z.string().describe('When the prediction was made'),
  
  // For display
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

**short** (🔥 Kurzfristig): 
- "heute", "morgen", "diese Woche", "nächste Woche"
- Deadline innerhalb von 14 Tagen

**mid** (📊 Mittelfristig):
- "diesen Monat", "nächsten Monat", "in 2 Wochen"  
- Deadline 2 Wochen bis 2 Monate

**long** (🎯 Langfristig):
- "dieses Jahr", "2025", "EOY", "Q1/Q2/Q3/Q4"
- "bis Sommer", "bis Weihnachten"
- Deadline über 2 Monate

## DIRECTION
- **bullish**: Preis steigt, ATH, Pump, Moon
- **bearish**: Preis fällt, Dump, Crash, unter X
- **neutral**: Seitwärts, Range, "hält sich bei X"

## CONFIDENCE
- **high**: Sehr bestimmt, "DEFINITIV", "100%", "ich schwöre"
- **medium**: Normal, einfache Behauptung
- **low**: Vorsichtig, "vielleicht", "könnte sein", "ich glaube"

## TARGET DATE
Berechne das targetDate als ISO String:
- "dieses Jahr" → 2025-12-31
- "EOY" → 2025-12-31
- "nächste Woche" → 7 Tage von heute
- "diesen Monat" → Ende des aktuellen Monats
- "Q1 2026" → 2026-03-31

## FORMAT
Extrahiere 5-30 Vorhersagen, priorisiere:
1. Klare Zeitangaben
2. Konkrete Preistargets
3. Hohe Confidence
4. Interessante/kontroverse Takes

Gib auch eine kurze Summary mit dem generellen Sentiment.`

// ═══════════════════════════════════════════════════════════════════════
// CACHE CONFIG
// ═══════════════════════════════════════════════════════════════════════

const CACHE_KEY = 'predictions-7d'
const CACHE_MAX_AGE_MINUTES = 30

// ═══════════════════════════════════════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const forceRefresh = searchParams.get('force') === 'true'
  
  try {
    const supabase = await createClient()
    
    // Check cache first
    if (!forceRefresh) {
      const { data: cached, error: cacheError } = await supabase
        .from('chat_timeline_cache')
        .select('*')
        .eq('cache_key', CACHE_KEY)
        .single()
      
      if (!cacheError && cached) {
        const cacheAge = (Date.now() - new Date(cached.updated_at).getTime()) / 60000
        
        if (cacheAge < CACHE_MAX_AGE_MINUTES) {
          console.log(`[PREDICTIONS] Cache hit, ${Math.round(cacheAge)}min old`)
          return NextResponse.json({
            predictions: cached.events || [],
            summary: cached.metadata?.summary || '',
            cached: true,
            fetchedAt: cached.updated_at,
            cacheAgeMinutes: Math.round(cacheAge)
          })
        }
      }
    }
    
    // Fetch last 7 days of messages
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 7)
    
    console.log(`[PREDICTIONS] Fetching messages from ${startDate.toISOString()} to ${endDate.toISOString()}`)
    
    const { data: messages, error: msgError } = await supabase
      .from('tv_chat_messages')
      .select('username, text, time')
      .gte('time', startDate.toISOString())
      .lte('time', endDate.toISOString())
      .order('time', { ascending: true })
      .limit(800)
    
    if (msgError) throw new Error(`Database error: ${msgError.message}`)
    if (!messages || messages.length === 0) {
      return NextResponse.json({
        predictions: [],
        summary: 'Keine Nachrichten gefunden',
        cached: false,
        fetchedAt: new Date().toISOString()
      })
    }
    
    console.log(`[PREDICTIONS] Found ${messages.length} messages`)
    
    // Get current BTC price for context
    const priceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
    const priceData = await priceRes.json()
    const currentPrice = priceData.bitcoin?.usd || 100000
    
    // Format messages for AI
    const chatContext = messages.map(msg => {
      const msgDate = new Date(msg.time)
      const dateStr = msgDate.toISOString().split('T')[0]
      const time = msgDate.toLocaleTimeString('de-DE', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'
      })
      return `[${dateStr} ${time}] @${msg.username}: ${msg.text}`
    }).join('\n')
    
    // Extract predictions with AI
    const result = await generateObject({
      model: openai('gpt-5.2'),
      schema: ExtractResponseSchema,
      system: EXTRACTION_PROMPT,
      prompt: `Aktueller BTC Preis: $${currentPrice.toLocaleString()}
Heutiges Datum: ${new Date().toISOString().split('T')[0]}

Extrahiere zeitbasierte Preis-Vorhersagen aus diesem Chat:

${chatContext}

Finde 10-25 konkrete Vorhersagen mit Zeitzielen.`,
      temperature: 0.7,
    })
    
    // Predictions from AI
    const enrichedPredictions = result.object.predictions
    
    // Save to cache
    const { error: cacheError } = await supabase
      .from('chat_timeline_cache')
      .upsert({
        cache_key: CACHE_KEY,
        events: enrichedPredictions,
        event_count: enrichedPredictions.length,
        date_range_start: startDate.toISOString().split('T')[0],
        date_range_end: endDate.toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
        metadata: {
          summary: result.object.summary,
          messageCount: messages.length,
          currentPrice
        }
      }, { onConflict: 'cache_key' })
    
    if (cacheError) {
      console.error('[PREDICTIONS] Cache save error:', cacheError)
    }
    
    console.log(`[PREDICTIONS] Extracted ${enrichedPredictions.length} predictions`)
    
    return NextResponse.json({
      predictions: enrichedPredictions,
      summary: result.object.summary,
      cached: false,
      fetchedAt: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('[PREDICTIONS] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to extract predictions', predictions: [] },
      { status: 500 }
    )
  }
}

