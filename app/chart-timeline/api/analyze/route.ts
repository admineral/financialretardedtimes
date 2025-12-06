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

// Schema for price-correlated quotes
const ChartQuoteSchema = z.object({
  id: z.string(),
  timestamp: z.string(), // ISO format datetime
  username: z.string(),
  quote: z.string().max(50), // MAX 50 chars - must be short for chart labels!
  priceContext: z.enum([
    'pump_call',        // Called a pump before it happened
    'dump_call',        // Called a dump before it happened  
    'top_call',         // Called the top
    'bottom_call',      // Called the bottom
    'fomo',             // FOMO statement during pump
    'panic',            // Panic statement during dump
    'diamond_hands',    // Holding through volatility
    'reversal',         // Called a reversal
    'sideways',         // Noted consolidation
    'analysis'          // Technical analysis
  ]),
  sentiment: z.enum(['bullish', 'bearish', 'neutral']),
  wasCorrect: z.boolean().optional(), // For predictions: was it correct?
  priceAtQuote: z.number(), // BTC price when quote was made
})

const AnalysisResponseSchema = z.object({
  headline: z.string().max(60), // Short headline for banner
  subheadline: z.string().max(100), // Secondary context
  priceChange: z.object({
    startPrice: z.number(),
    endPrice: z.number(),
    changePercent: z.number(),
    trend: z.enum(['bullish', 'bearish', 'sideways'])
  }),
  quotes: z.array(ChartQuoteSchema).min(6).max(20), // 6-20 quality quotes
  bestCall: z.object({
    username: z.string(),
    quote: z.string().max(60),
    context: z.string().max(80)
  }).optional(),
  worstCall: z.object({
    username: z.string(),
    quote: z.string().max(60),
    context: z.string().max(80)
  }).optional(),
  // Metadata about data sent to AI
  dataRange: z.object({
    messagesFrom: z.string(), // ISO date of oldest message
    messagesTo: z.string(),   // ISO date of newest message
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
    
    // Fallback: fetch from Binance (15m candles, 7 days = 672 candles)
    console.log('[ANALYZE] No 15m cache, fetching from Binance...')
    const url = 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=672'
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
  const fourHourMs = 4 * 60 * 60 * 1000
  const fourHourCandles = aggregateCandles(ohlcData, fourHourMs)
  
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
  lines.push(`## Chat-Nachrichten (${messages.length} total):`)
  lines.push('')
  
  // Group messages by day
  const messagesByDay = new Map<string, ChatMessage[]>()
  for (const msg of messages) {
    const day = new Date(msg.time).toISOString().split('T')[0]
    if (!messagesByDay.has(day)) messagesByDay.set(day, [])
    messagesByDay.get(day)!.push(msg)
  }
  
  // Sort days chronologically
  const sortedDays = Array.from(messagesByDay.keys()).sort()
  
  for (const day of sortedDays) {
    const dayMessages = messagesByDay.get(day)!
    const dayFormatted = new Date(day).toLocaleDateString('de-DE', { 
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' 
    })
    
    lines.push(`### ${dayFormatted} (${dayMessages.length} Nachrichten):`)
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

const ANALYSIS_PROMPT = `Du bist ein Chart-Analyst. Finde die besten PREIS-VORHERSAGEN aus dem Chat.

## ZIEL: Finde 12-18 QUALITÄTS-Zitate die auf einem BTC-Chart gut aussehen

## ⚠️ KRITISCH: ZEITLICHE VERTEILUNG ÜBER 7 TAGE ⚠️

NICHT NUR NEUESTE NACHRICHTEN! Du MUSST Zitate aus ALLEN 7 TAGEN wählen!

### PFLICHT-VERTEILUNG:
- Tag 1-2 (vor 5-7 Tagen): Mindestens 2-3 Zitate
- Tag 3-4 (vor 3-5 Tagen): Mindestens 2-3 Zitate  
- Tag 5-6 (vor 1-3 Tagen): Mindestens 3-4 Zitate
- Tag 7 (heute): Mindestens 2-3 Zitate

### ANTI-CLUSTERING REGEL:
- NIEMALS mehr als 2 Zitate innerhalb von 4 Stunden
- Verteile Zitate über den GESAMTEN Chart-Zeitraum
- Ältere Zitate sind GENAUSO WICHTIG wie neue!

### WARUM DAS WICHTIG IST:
Der Chart zeigt 7 Tage - wenn alle Zitate rechts am neuesten Ende clustern, sieht der Chart unausgewogen aus. Wir wollen eine schöne VISUELLE VERTEILUNG über den gesamten Chart!

## QUALITÄT > QUANTITÄT
- Lieber 12 starke Zitate als 18 schwache
- BESTE Zitate: Klare Preis-Predictions die man verifizieren kann
- Beispiel GUTES Zitat: "Long bei 89k, Ziel 95k" (konkret, verifizierbar)
- Beispiel SCHLECHTES Zitat: "Interessant..." (vage, langweilig)

## PRIORITÄT 1: Echte Predictions (pump_call, dump_call, top_call, bottom_call)
- "Jetzt Long!" / "Short here!" / "Das ist der Boden" / "Top ist drin"
- Preisprognosen: "100k kommt" / "Wir sehen 80k"
→ Setze wasCorrect=true/false basierend auf dem tatsächlichen Preisverlauf!

## PRIORITÄT 2: Starke Reaktionen (fomo, panic, diamond_hands)
- Extreme FOMO: "ALL IN JETZT!" / "Warum hab ich nicht gekauft?!"
- Echte Panik: "Alles verkauft" / "RIP"
- Diamond Hands in kritischen Momenten

## PRIORITÄT 3: Gute Analysen (analysis, reversal)
- Nur wenn sie KONKRET sind und sich auf Preis beziehen

## FORMAT für jedes Zitat:
- quote: MAX 50 ZEICHEN! Nur der Kern. Kürze radikal.
- timestamp: Exakt aus dem Chat (ISO format) - NUTZE TIMESTAMPS AUS DER VOLLEN WOCHE!
- priceAtQuote: BTC-Preis zu dem Zeitpunkt (aus Preis-Timeline schätzen)
- wasCorrect: Bei Predictions IMMER setzen (true/false)
- priceContext: Passende Kategorie wählen

## HEADLINE
Kurz und knackig, max 60 Zeichen.

NUR JSON ausgeben, keine Erklärungen.`

/**
 * GET - Return cached analysis
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get the most recent analysis from cache
    const { data: cached, error } = await supabase
      .from('chart_timeline_analysis_cache')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()
    
    if (error || !cached) {
      console.log('[ANALYZE GET] No cached analysis found')
      return NextResponse.json({
        cached: false,
        analysis: null,
        message: 'No cached analysis available. Click refresh to generate.'
      })
    }
    
    console.log(`[ANALYZE GET] Returning cached analysis from ${cached.updated_at}`)
    
    return NextResponse.json({
      cached: true,
      analysis: cached.analysis_data as AnalysisResponse,
      fetchedAt: cached.updated_at,
      quoteCount: cached.quote_count,
      messageCount: cached.message_count,
      dataRange: cached.data_range || null  // { messagesFrom, messagesTo }
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
    
    // Fetch ALL chat messages from the 7-day range
    const { data: messages, error, count } = await supabase
      .from('tv_chat_messages')
      .select('id, username, text, time, user_pic', { count: 'exact' })
      .gte('time', sevenDaysAgo.toISOString())
      .lte('time', now.toISOString())
      .order('time', { ascending: true })  // Chronological order
    
    if (error) {
      console.error('[ANALYZE] Supabase error:', error)
      return new Response(JSON.stringify({ error: 'Database error' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
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
      totalInRange: count,
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
    
    // Use streamObject for streaming response
    const result = streamObject({
      model: openai('gpt-4o-mini'),
      schema: AnalysisResponseSchema,
      system: ANALYSIS_PROMPT,
      prompt: fullContext,
      temperature: 0.8,
      async onFinish({ object }) {
        // Store in cache when streaming completes
        if (object) {
          try {
            const analysisData = object as AnalysisResponse
            const { error: insertError } = await supabase
              .from('chart_timeline_analysis_cache')
              .insert({
                analysis_data: analysisData,
                quote_count: analysisData.quotes?.length || 0,
                message_count: messages?.length || 0,
                start_price: analysisData.priceChange?.startPrice,
                end_price: analysisData.priceChange?.endPrice,
                price_change_percent: analysisData.priceChange?.changePercent,
                data_range: dataRange,  // Store the date range
              })
            
            if (insertError) {
              console.error('[ANALYZE] Cache insert error:', insertError)
            } else {
              console.log('[ANALYZE] Cached new analysis successfully')
            }
          } catch (cacheError) {
            console.error('[ANALYZE] Failed to cache analysis:', cacheError)
          }
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
