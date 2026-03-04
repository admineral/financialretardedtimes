/**
 * route.ts (Chart Timeline AI Analysis)
 * 
 * AI-powered analysis that correlates chat messages with BTC price action.
 * Now with Supabase caching - only runs OpenAI when force=true or no cache exists.
 * 
 * ENDPOINT: 
 * - GET /chart-timeline/api/analyze - Returns cached analysis
 * - POST /chart-timeline/api/analyze?force=true - Generates fresh analysis
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { z } from 'zod'

// Schema for price-correlated quotes (lenient validation for streaming)
const ChartQuoteSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  username: z.string(),
  title: z.string(),
  fullQuote: z.string(),
  priceContext: z.enum([
    'pump_call', 'dump_call', 'top_call', 'bottom_call',
    'fomo', 'panic', 'diamond_hands', 'reversal', 'sideways', 'analysis'
  ]),
  sentiment: z.enum(['bullish', 'bearish', 'neutral']),
  wasCorrect: z.boolean().optional(),
  priceAtQuote: z.number(),
  hasTimeframe: z.boolean().optional(),
})

const AnalysisResponseSchema = z.object({
  headline: z.string(), // Short headline for banner
  subheadline: z.string(), // Secondary context
  priceChange: z.object({
    startPrice: z.number(),
    endPrice: z.number(),
    changePercent: z.number(),
    trend: z.enum(['bullish', 'bearish', 'sideways'])
  }),
  quotes: z.array(ChartQuoteSchema).min(1), // At least 1 quote
  bestCall: z.object({
    username: z.string(),
    quote: z.string(),
    context: z.string()
  }).optional(),
  worstCall: z.object({
    username: z.string(),
    quote: z.string(),
    context: z.string()
  }).optional(),
  // Metadata about data sent to AI
  dataRange: z.object({
    messagesFrom: z.string(),
    messagesTo: z.string(),
    messageCount: z.number(),
  }).optional()
})

type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>

interface OHLCData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

interface ChatMessage {
  id: string
  username: string
  text: string
  time: string
  user_pic?: string
}

// Fetch OHLC data from cache or Binance
// Uses 15m timeframe to match chart display (7 days)
async function fetchOHLCData(supabase: Awaited<ReturnType<typeof createClient>>): Promise<OHLCData[]> {
  try {
    // Use 15m timeframe to match chart display (7 days range)
    const { data: cached } = await supabase
      .from('chart_timeline_ohlc_cache')
      .select('candles')
      .eq('timeframe', '15m')
      .single()
    
    if (cached?.candles && Array.isArray(cached.candles) && cached.candles.length > 0) {
      console.log(`[ANALYZE] Using cached 15m OHLC data: ${cached.candles.length} candles`)
      return cached.candles as OHLCData[]
    }
    
    // Fallback: fetch from Binance (15m candles, 11 days = 1056 candles)
    console.log('[ANALYZE] No 15m cache, fetching from Binance...')
    const url = 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=1056'
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    })
    
    if (!response.ok) return []
    
    type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string]
    const rawData: BinanceKline[] = await response.json()
    return rawData.map(kline => ({
      timestamp: kline[0],
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4])
    }))
  } catch (error) {
    console.error('[ANALYZE] OHLC fetch error:', error)
    return []
  }
}

// Aggregate candles into larger timeframes
function aggregateCandles(data: OHLCData[], intervalMs: number): OHLCData[] {
  if (data.length === 0) return []
  
  const result: OHLCData[] = []
  let currentBucket: OHLCData[] = []
  let bucketStart = Math.floor(data[0].timestamp / intervalMs) * intervalMs
  
  for (const candle of data) {
    const candleBucket = Math.floor(candle.timestamp / intervalMs) * intervalMs
    
    if (candleBucket !== bucketStart && currentBucket.length > 0) {
      // Aggregate current bucket
      result.push({
        timestamp: bucketStart,
        open: currentBucket[0].open,
        high: Math.max(...currentBucket.map(c => c.high)),
        low: Math.min(...currentBucket.map(c => c.low)),
        close: currentBucket[currentBucket.length - 1].close
      })
      currentBucket = []
      bucketStart = candleBucket
    }
    currentBucket.push(candle)
  }
  
  // Don't forget last bucket
  if (currentBucket.length > 0) {
    result.push({
      timestamp: bucketStart,
      open: currentBucket[0].open,
      high: Math.max(...currentBucket.map(c => c.high)),
      low: Math.min(...currentBucket.map(c => c.low)),
      close: currentBucket[currentBucket.length - 1].close
    })
  }
  
  return result
}

// Group candles by day
function groupByDay(data: OHLCData[]): Map<string, OHLCData[]> {
  const groups = new Map<string, OHLCData[]>()
  
  for (const candle of data) {
    const date = new Date(candle.timestamp).toISOString().split('T')[0]
    if (!groups.has(date)) groups.set(date, [])
    groups.get(date)!.push(candle)
  }
  
  return groups
}

// Find local turning points (highs and lows) in price data
function findTurningPoints(candles: OHLCData[], lookback: number = 3): { highs: OHLCData[]; lows: OHLCData[] } {
  const highs: OHLCData[] = []
  const lows: OHLCData[] = []
  
  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = candles[i]
    let isHigh = true
    let isLow = true
    
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue
      if (candles[j].high >= current.high) isHigh = false
      if (candles[j].low <= current.low) isLow = false
    }
    
    if (isHigh) highs.push(current)
    if (isLow) lows.push(current)
  }
  
  return { highs, lows }
}

// Format price data for AI with structured multi-level detail
function formatPriceContext(ohlcData: OHLCData[]): { text: string; summary: object } {
  if (ohlcData.length === 0) {
    return { 
      text: 'Keine Preisdaten verfügbar.', 
      summary: { sent: 0 } 
    }
  }
  
  const lines: string[] = []
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  
  // Overall stats
  const firstPrice = ohlcData[0].open
  const lastPrice = ohlcData[ohlcData.length - 1].close
  const change = ((lastPrice - firstPrice) / firstPrice * 100).toFixed(2)
  const high = Math.max(...ohlcData.map(c => c.high))
  const low = Math.min(...ohlcData.map(c => c.low))
  const firstDate = new Date(ohlcData[0].timestamp)
  const lastDate = new Date(ohlcData[ohlcData.length - 1].timestamp)
  
  lines.push(`## BTC Preisentwicklung (7 Tage)`)
  lines.push(`Zeitraum: ${firstDate.toLocaleDateString('de-DE')} - ${lastDate.toLocaleDateString('de-DE')}`)
  lines.push(`Start: $${firstPrice.toFixed(0)} | Aktuell: $${lastPrice.toFixed(0)} | Änderung: ${change}%`)
  lines.push(`7-Tage-Hoch: $${high.toFixed(0)} | 7-Tage-Tief: $${low.toFixed(0)}`)
  lines.push('')
  
  // SECTION 0: TURNING POINTS - Most important for AI correlation!
  const fourHourMs = 4 * 60 * 60 * 1000
  const fourHourCandles = aggregateCandles(ohlcData, fourHourMs)
  const turningPoints = findTurningPoints(fourHourCandles, 2)
  
  lines.push(`## ⚠️ WICHTIGE WENDEPUNKTE (für Quote-Korrelation!):`)
  lines.push('')
  
  if (turningPoints.highs.length > 0) {
    lines.push(`### 📈 LOKALE HOCHS (hier nach "dump_call" oder "top_call" suchen):`)
    for (const tp of turningPoints.highs.slice(-8)) { // Last 8 highs
      const date = new Date(tp.timestamp)
      const dateStr = date.toLocaleString('de-DE', { 
        weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
      })
      lines.push(`  🔺 ${dateStr}: HIGH bei $${tp.high.toFixed(0)} → Suche Calls um diese Zeit!`)
    }
    lines.push('')
  }
  
  if (turningPoints.lows.length > 0) {
    lines.push(`### 📉 LOKALE TIEFS (hier nach "pump_call" oder "bottom_call" suchen):`)
    for (const tp of turningPoints.lows.slice(-8)) { // Last 8 lows
      const date = new Date(tp.timestamp)
      const dateStr = date.toLocaleString('de-DE', { 
        weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
      })
      lines.push(`  🔻 ${dateStr}: LOW bei $${tp.low.toFixed(0)} → Suche Calls um diese Zeit!`)
    }
    lines.push('')
  }
  
  // Find big moves (>2% in 4h)
  const bigMoves: { candle: OHLCData; changePercent: number }[] = []
  for (const candle of fourHourCandles) {
    const changePercent = ((candle.close - candle.open) / candle.open) * 100
    if (Math.abs(changePercent) >= 2) {
      bigMoves.push({ candle, changePercent })
    }
  }
  
  if (bigMoves.length > 0) {
    lines.push(`### 🚀 STARKE BEWEGUNGEN >2% (hier nach FOMO/Panik suchen):`)
    for (const move of bigMoves.slice(-10)) { // Last 10 big moves
      const date = new Date(move.candle.timestamp)
      const dateStr = date.toLocaleString('de-DE', { 
        weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
      })
      const emoji = move.changePercent > 0 ? '🟢' : '🔴'
      const direction = move.changePercent > 0 ? 'PUMP' : 'DUMP'
      lines.push(`  ${emoji} ${dateStr}: ${direction} ${move.changePercent.toFixed(1)}% ($${move.candle.open.toFixed(0)}→$${move.candle.close.toFixed(0)})`)
    }
    lines.push('')
  }
  
  // SECTION 1: Daily summaries (open, high, low, close for each day)
  lines.push(`## Tägliche Übersicht:`)
  const dailyGroups = groupByDay(ohlcData)
  const sortedDays = Array.from(dailyGroups.keys()).sort()
  
  for (const day of sortedDays) {
    const dayCandles = dailyGroups.get(day)!
    const dayOpen = dayCandles[0].open
    const dayClose = dayCandles[dayCandles.length - 1].close
    const dayHigh = Math.max(...dayCandles.map(c => c.high))
    const dayLow = Math.min(...dayCandles.map(c => c.low))
    const dayChange = ((dayClose - dayOpen) / dayOpen * 100).toFixed(1)
    const emoji = dayClose >= dayOpen ? '🟢' : '🔴'
    const isToday = day === todayStr ? ' (HEUTE)' : ''
    
    const dayFormatted = new Date(day).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
    lines.push(`${dayFormatted}${isToday}: Open $${dayOpen.toFixed(0)} → Close $${dayClose.toFixed(0)} ${emoji} ${dayChange}% | H: $${dayHigh.toFixed(0)} L: $${dayLow.toFixed(0)}`)
  }
  lines.push('')
  
  // SECTION 2: 4H candles for full week (42 candles for 7 days)
  lines.push(`## 4-Stunden-Kerzen (${fourHourCandles.length} Kerzen):`)
  for (const candle of fourHourCandles) {
    const date = new Date(candle.timestamp)
    const dateStr = date.toLocaleString('de-DE', { 
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
    })
    const candleChange = ((candle.close - candle.open) / candle.open * 100).toFixed(1)
    const emoji = candle.close >= candle.open ? '🟢' : '🔴'
    lines.push(`${dateStr}: $${candle.open.toFixed(0)}→$${candle.close.toFixed(0)} ${emoji} ${candleChange}% (H:$${candle.high.toFixed(0)} L:$${candle.low.toFixed(0)})`)
  }
  lines.push('')
  
  // SECTION 3: Detailed hourly for TODAY
  const todayCandles = dailyGroups.get(todayStr) || []
  if (todayCandles.length > 0) {
    const hourMs = 60 * 60 * 1000
    const hourlyToday = aggregateCandles(todayCandles, hourMs)
    
    lines.push(`## HEUTE Detail (${hourlyToday.length} Stunden):`)
    for (const candle of hourlyToday) {
      const time = new Date(candle.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      const candleChange = ((candle.close - candle.open) / candle.open * 100).toFixed(2)
      const emoji = candle.close >= candle.open ? '🟢' : '🔴'
      lines.push(`${time}: $${candle.open.toFixed(0)}→$${candle.close.toFixed(0)} ${emoji} ${candleChange}%`)
    }
  }
  
  // Build summary for logging
  const summary = {
    originalCandles: ohlcData.length,
    dailySummaries: sortedDays.length,
    fourHourCandles: fourHourCandles.length,
    todayHourlyCandles: todayCandles.length > 0 ? aggregateCandles(todayCandles, 60 * 60 * 1000).length : 0,
    turningPoints: {
      highs: turningPoints.highs.length,
      lows: turningPoints.lows.length,
      bigMoves: bigMoves.length
    },
    dateRange: {
      from: firstDate.toISOString(),
      to: lastDate.toISOString()
    },
    priceRange: {
      start: firstPrice,
      end: lastPrice,
      high,
      low,
      changePercent: parseFloat(change)
    }
  }
  
  return { text: lines.join('\n'), summary }
}

// Format chat for AI - GROUPED BY DAY so model sees full timeline
function formatChatContext(messages: ChatMessage[]): string {
  const lines: string[] = []
  
  // Group messages by day
  const messagesByDay = new Map<string, ChatMessage[]>()
  for (const msg of messages) {
    const day = new Date(msg.time).toISOString().split('T')[0]
    if (!messagesByDay.has(day)) messagesByDay.set(day, [])
    messagesByDay.get(day)!.push(msg)
  }
  
  // Sort days chronologically
  const sortedDays = Array.from(messagesByDay.keys()).sort()
  
  // Summary header with day counts
  lines.push(`## Chat-Nachrichten (${messages.length} total, ${sortedDays.length} Tage):`)
  lines.push('')
  lines.push(`⚠️ PFLICHT: Finde Zitate aus JEDEM dieser Tage:`)
  sortedDays.forEach((day, idx) => {
    const count = messagesByDay.get(day)!.length
    const dayNum = idx + 1
    const required = dayNum <= 2 ? '(mind. 1 Zitat!)' : dayNum <= 4 ? '(mind. 1-2 Zitate!)' : '(mind. 2 Zitate!)'
    lines.push(`  • ${day}: ${count} Nachrichten ${required}`)
  })
  lines.push('')
  lines.push('═══════════════════════════════════════════════════')
  lines.push('')
  
  for (const day of sortedDays) {
    const dayMessages = messagesByDay.get(day)!
    const dayFormatted = new Date(day).toLocaleDateString('de-DE', { 
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' 
    })
    
    lines.push(`### 📅 ${dayFormatted} (${dayMessages.length} Nachrichten) - FINDE HIER ZITATE!`)
    lines.push('')
    
    for (const msg of dayMessages) {
      const text = msg.text.length > 300 ? msg.text.slice(0, 300) + '...' : msg.text
      const time = new Date(msg.time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      lines.push(`[${time}] @${msg.username}: ${text}`)
    }
    lines.push('')  // Empty line between days
  }
  
  return lines.join('\n')
}

const ANALYSIS_PROMPT = `Du bist Chart-Analyst der "Financial Retarded Times" – trocken, neutral, marktberichtartig.

═══════════════════════════════════════════════════════════════════════
⛔ ABSOLUT IGNORIEREN – RATE CHART GAME TIPPS
═══════════════════════════════════════════════════════════════════════
Nachrichten die mit "//" und einem Preis beginnen (z.B. //88.5k, //95000, //92K) sind 
SPIELTIPPS und müssen KOMPLETT IGNORIERT werden - niemals als Quote verwenden!

═══════════════════════════════════════════════════════════════════════
HAUPT-ZIEL: ECHTE, CHART-RELEVANTE AUSSAGEN MIT ZEITANGABEN
═══════════════════════════════════════════════════════════════════════

Finde die WERTVOLLSTEN Aussagen die wirklich relevant für den Bitcoin-Chart sind.
Bevorzuge Calls mit ZEITLICHEN Angaben – das macht sie überprüfbar und spannend!

### 🥇 HÖCHSTE PRIORITÄT – CALLS MIT ZEITANGABE:
- "HEUTE noch 100K!" / "Morgen Short-Squeeze"
- "Diese Woche Boden" / "Am Wochenende dump"
- "Innerhalb 24h wieder bei 95K"
- "Daily Close entscheidend"
→ Diese setzen hasTimeframe=true!

### 🥈 HOHE PRIORITÄT – KLARE RICHTUNGSCALLS AN WENDEPUNKTEN:
- "LONG JETZT!" / "SHORT!" (genau am Wendepunkt)
- "Das ist der Boden" / "Top ist erreicht"
- "All in!" / "Alles raus hier!"
- Konkrete Preislevel: "Bei 92K Long", "95K ist der deckel"

### 🥉 MITTEL – REAKTIONEN MIT SUBSTANZ:
- Technische Begründung: "RSI oversold, bounce incoming"
- Emotionale Momente: FOMO, Panik, Diamond Hands
- Konkrete Prognosen: "100k incoming", "80k wir kommen"

### ❌ IGNORIEREN – WERTLOSE KOMMENTARE:
- Fragen: "Was denkt ihr?", "Geht's hoch?"
- Passives: "Interessant", "Hmm", "Mal sehen", "Sieht bullish aus"
- Allgemeines Gerede ohne Position
- Rate Chart Game Tipps (//PREIS)

═══════════════════════════════════════════════════════════════════════
ZITAT-FORMAT – TITEL + ORIGINAL-ZITAT
═══════════════════════════════════════════════════════════════════════

Für jeden Quote brauchst du ZWEI Felder:

1. **title** (max 40 Zeichen): Knackiger Titel für Chart-Label
   - "LONG bei 92K!" / "Top Call" / "Morgen 100K"
   - Kurz, prägnant, zeigt die Kernaussage

2. **fullQuote** (max 200 Zeichen): Das EXAKTE Original-Zitat!
   - WORTWÖRTLICH aus dem Chat kopieren!
   - Nicht umformulieren oder kürzen
   - Der User soll sich selbst erkennen
   - Beispiel: "Achtung Leute, heute noch 100k. Wer jetzt noch short ist, wird das bereuen. Letzte Warnung!"

═══════════════════════════════════════════════════════════════════════
PREIS-KORRELATION – CALLS AN WENDEPUNKTEN
═══════════════════════════════════════════════════════════════════════

Analysiere die Preis-Daten und identifiziere:
1. LOKALE HOCHS: Wann war der Preis auf einem lokalen Maximum?
2. LOKALE TIEFS: Wann war der Preis auf einem lokalen Minimum?
3. STARKE MOVES: Wann gab es >2% Bewegungen in kurzer Zeit?

Dann suche Chat-Nachrichten die GENAU ZU DIESEN ZEITPUNKTEN passen:
- Bei einem TIEF → Finde "bottom_call" oder "pump_call" Nachrichten
- Bei einem HOCH → Finde "top_call" oder "dump_call" Nachrichten
- Bei starken Moves → Finde FOMO/Panik Reaktionen

**wasCorrect setzen:**
- Call war richtig → wasCorrect=true (Preis ging in die vorhergesagte Richtung)
- Call war falsch → wasCorrect=false (Preis ging gegen die Vorhersage)

═══════════════════════════════════════════════════════════════════════
⚠️ KRITISCH: ZEITLICHE VERTEILUNG ÜBER ALLE 7 TAGE!
═══════════════════════════════════════════════════════════════════════

Du MUSST Zitate aus JEDEM Tag des 7-Tage-Zeitraums finden!

PFLICHT-VERTEILUNG (15-18 Zitate total):
- Tag 1-2 (älteste): Mindestens 2 Zitate
- Tag 3-4: Mindestens 3 Zitate  
- Tag 5-6: Mindestens 3 Zitate
- Tag 7 (heute/gestern): Mindestens 3 Zitate

REGELN:
- MAXIMAL 3 Zitate pro Tag erlaubt (Cluster vermeiden!)
- Nicht mehr als 2 Zitate innerhalb von 4 Stunden
- Bevorzuge Zitate mit hasTimeframe=true!
- Wenn ein Tag "langweilig" ist, finde trotzdem 1-2 interessante Aussagen

WARUM: Der User will die GANZE Woche sehen, nicht nur den einen Tag mit Crash/Pump!

═══════════════════════════════════════════════════════════════════════
BESTCALL & WORSTCALL – DIE HIGHLIGHTS
═══════════════════════════════════════════════════════════════════════

bestCall: Der BESTE Call der Woche
- Idealer­weise mit Zeitangabe die sich bewahrheitet hat
- Genau am Wendepunkt richtig gelegen
- quote: Das exakte Zitat (etwas länger erlaubt, bis 60 Zeichen)
- context: Warum war es so gut? "Rief Long genau am Wochentief, 5% Pump folgte"

worstCall: Der SCHLECHTESTE Call der Woche
- Komplett falsch gelegen, idealer­weise mit Zeitangabe
- quote: Das exakte Zitat
- context: Neutral beschreiben was passierte "Short-Call am Tief, Preis stieg 8%"

═══════════════════════════════════════════════════════════════════════
HEADLINE & SUBHEADLINE
═══════════════════════════════════════════════════════════════════════

headline (max 60 Zeichen): Knackig, bezieht sich auf die Woche
- "Wilde Woche: 92K → 100K → 95K"
- "Die Bären lagen falsch"
- "Weekend-Dump, dann V-Recovery"

subheadline (max 100 Zeichen): Etwas mehr Kontext
- "Wer am Montag Long ging, wurde belohnt. Die Short-Fraktion leckt Wunden."

TON: Trocken, neutral, marktberichtartig. Nicht cringe oder übertrieben emotional.

NUR JSON ausgeben, keine Erklärungen.`

/**
 * GET - Return cached analysis
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get the most recent analysis from cache
    const { data: cached, error, count } = await supabase
      .from('chart_timeline_analysis_cache')
      .select('*', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()
    
    if (error || !cached) {
      console.log('[ANALYZE GET] No cached analysis found, error:', error?.message)
      return NextResponse.json({
        cached: false,
        analysis: null,
        message: 'No cached analysis available. Click refresh to generate.'
      })
    }
    
    // Log cache details for debugging
    const analysisData = cached.analysis_data as AnalysisResponse
    console.log(`[ANALYZE GET] Returning cached analysis:`, {
      id: cached.id,
      updated_at: cached.updated_at,
      headline: analysisData?.headline?.slice(0, 40),
      quoteCount: cached.quote_count,
      dataRange: cached.data_range
    })
    
    return NextResponse.json({
      cached: true,
      analysis: analysisData,
      fetchedAt: cached.updated_at,
      quoteCount: cached.quote_count,
      messageCount: cached.message_count,
      dataRange: cached.data_range || null
    })
    
  } catch (error) {
    console.error('[ANALYZE GET] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch cached analysis' },
      { status: 500 }
    )
  }
}

/**
 * POST - Generate fresh analysis (with optional force parameter)
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const forceRefresh = searchParams.get('force') === 'true'
  
  try {
    if (!process.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const supabase = await createClient()
    
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('chart_timeline_analysis_cache')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()
      
      if (cached) {
        console.log('[ANALYZE POST] Returning cached analysis (no force flag)')
        return NextResponse.json({
          cached: true,
          analysis: cached.analysis_data as AnalysisResponse,
          fetchedAt: cached.updated_at
        })
      }
    }
    
    console.log('[ANALYZE POST] Generating fresh analysis...')
    
    // Calculate date range
    const now = new Date()
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    console.log('[ANALYZE] Date range:', {
      from: sevenDaysAgo.toISOString(),
      to: now.toISOString(),
    })
    
    // Fetch OHLC data (from cache or Binance)
    const ohlcData = await fetchOHLCData(supabase)
    const ohlcFirst = ohlcData[0]
    const ohlcLast = ohlcData[ohlcData.length - 1]
    console.log('[ANALYZE] OHLC data:', {
      count: ohlcData.length,
      firstCandle: ohlcFirst ? new Date(ohlcFirst.timestamp).toISOString() : null,
      lastCandle: ohlcLast ? new Date(ohlcLast.timestamp).toISOString() : null,
    })
    
    // Fetch ALL chat messages from the 7-day range using pagination
    // Supabase has a server-side limit of 1000 rows per request, so we paginate
    console.log('[ANALYZE] Fetching messages with pagination (1000 per batch)...')
    
    const allMessages: ChatMessage[] = []
    let lastTime: string | null = null
    let batchCount = 0
    const BATCH_SIZE = 1000
    const MAX_BATCHES = 10 // Safety limit: max 10,000 messages
    
    while (batchCount < MAX_BATCHES) {
      let query = supabase
        .from('tv_chat_messages')
        .select('id, username, text, time, user_pic')
        .gte('time', sevenDaysAgo.toISOString())
        .lte('time', now.toISOString())
        .order('time', { ascending: true })
        .limit(BATCH_SIZE)
      
      // For subsequent batches, start after the last message's time
      if (lastTime) {
        query = query.gt('time', lastTime)
      }
      
      const { data: batch, error: batchError } = await query
      
      if (batchError) {
        console.error('[ANALYZE] Supabase batch error:', batchError)
        break
      }
      
      if (!batch || batch.length === 0) {
        break // No more messages
      }
      
      allMessages.push(...(batch as ChatMessage[]))
      lastTime = batch[batch.length - 1].time
      batchCount++
      
      console.log(`[ANALYZE] Batch ${batchCount}: fetched ${batch.length} messages (total: ${allMessages.length})`)
      
      if (batch.length < BATCH_SIZE) {
        break // Last batch was partial, no more messages
      }
    }
    
    const messages = allMessages
    const count = allMessages.length
    
    if (!messages || messages.length === 0) {
      console.error('[ANALYZE] No messages found in date range')
      return new Response(JSON.stringify({ error: 'No messages found' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // Group messages by day for logging
    const dayMs = 24 * 60 * 60 * 1000
    const messagesByDay = new Map<string, number>()
    for (const msg of messages) {
      const day = new Date(msg.time).toISOString().split('T')[0]
      messagesByDay.set(day, (messagesByDay.get(day) || 0) + 1)
    }
    console.log('[ANALYZE] Messages per day:', Object.fromEntries(messagesByDay))
    
    const sortedMessages = messages as ChatMessage[]  // Already sorted chronologically
    const oldestMsg = sortedMessages[0]
    const newestMsg = sortedMessages[sortedMessages.length - 1]
    
    console.log('[ANALYZE] Chat messages:', {
      fetched: messages?.length || 0,
      batches: batchCount,
      newest: newestMsg ? { time: newestMsg.time, user: newestMsg.username, text: newestMsg.text?.slice(0, 50) } : null,
      oldest: oldestMsg ? { time: oldestMsg.time, user: oldestMsg.username } : null,
    })
    
    if (!messages || messages.length === 0) {
      console.log('[ANALYZE] No messages found in date range!')
      return new Response(JSON.stringify({ error: 'No messages found' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    const { text: priceContext, summary: priceSummary } = formatPriceContext(ohlcData)
    const chatContext = formatChatContext(sortedMessages)  // Sorted chronologically for AI
    const fullContext = `${priceContext}\n\n${chatContext}`
    
    // Log price data summary
    console.log('[ANALYZE] Price data sent to AI:', JSON.stringify(priceSummary, null, 2))
    console.log('[ANALYZE] Sending to OpenAI...')
    
    // Prepare data range info
    const dataRange = {
      messagesFrom: oldestMsg?.time || sevenDaysAgo.toISOString(),
      messagesTo: newestMsg?.time || now.toISOString(),
      messageCount: messages?.length || 0
    }
    console.log('[ANALYZE] Data range being sent:', dataRange)
    
    // Delete ALL old cache entries BEFORE streaming starts
    console.log('[ANALYZE] Deleting old cache entries...')
    const { error: deleteError } = await supabase
      .from('chart_timeline_analysis_cache')
      .delete()
      .gte('id', 0)  // Match all rows (id is an integer)
    
    if (deleteError) {
      console.error('[ANALYZE] Failed to delete old cache:', deleteError)
    } else {
      console.log('[ANALYZE] Deleted old cache entries')
    }
    
    // Use streamObject for streaming response
    // Note: gpt-5.2 is a reasoning model and doesn't support temperature
    const result = streamObject({
      model: openai('gpt-5.2'),
      schema: AnalysisResponseSchema,
      system: ANALYSIS_PROMPT,
      prompt: fullContext,
      onError(event) {
        console.error('[ANALYZE] ❌ Stream onError:', event.error)
      },
      async onFinish({ object, error, usage }) {
        // Store in cache when streaming completes
        // IMPORTANT: Create a fresh supabase client for the async callback
        // The original client may have stale connection in streaming context
        console.log('[ANALYZE] 🏁 Stream finished:', { 
          hasObject: !!object, 
          hasError: !!error,
          usage 
        })
        
        if (error) {
          console.error('[ANALYZE] ❌ Stream error:', error)
          return
        }
        
        if (!object) {
          console.error('[ANALYZE] ❌ Stream finished but no object returned! This usually means schema validation failed.')
          return
        }
        
        try {
          const freshSupabase = await createClient()
          const analysisData = object as AnalysisResponse
          
          console.log('[ANALYZE] Analysis complete:', {
            headline: analysisData.headline,
            quoteCount: analysisData.quotes?.length || 0,
          })
          
          // First, delete any entries that might have been created since we started
          await freshSupabase
            .from('chart_timeline_analysis_cache')
            .delete()
            .gte('id', 0)  // Match all rows (id is an integer)
          
          // Now insert the fresh analysis
          const { data: insertedData, error: insertError } = await freshSupabase
            .from('chart_timeline_analysis_cache')
            .insert({
              analysis_data: analysisData,
              quote_count: analysisData.quotes?.length || 0,
              message_count: messages?.length || 0,
              start_price: analysisData.priceChange?.startPrice,
              end_price: analysisData.priceChange?.endPrice,
              price_change_percent: analysisData.priceChange?.changePercent,
              data_range: dataRange,
            })
            .select('id, updated_at')
            .single()
          
          if (insertError) {
            console.error('[ANALYZE] ❌ Cache insert error:', JSON.stringify(insertError))
          } else {
            console.log('[ANALYZE] ✅ Cached new analysis successfully:', {
              id: insertedData?.id,
              updated_at: insertedData?.updated_at,
              headline: analysisData.headline?.slice(0, 30)
            })
          }
        } catch (cacheError) {
          console.error('[ANALYZE] ❌ Failed to cache analysis:', cacheError)
        }
      }
    })
    
    return result.toTextStreamResponse()
    
  } catch (error) {
    console.error('[ANALYZE] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Analysis failed' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
