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
  quotes: z.array(ChartQuoteSchema).min(6).max(12), // 6-12 quality quotes
  bestCall: z.object({
    username: z.string(),
    quote: z.string().max(60),
    context: z.string().max(80)
  }).optional(),
  worstCall: z.object({
    username: z.string(),
    quote: z.string().max(60),
    context: z.string().max(80)
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
async function fetchOHLCData(supabase: Awaited<ReturnType<typeof createClient>>): Promise<OHLCData[]> {
  try {
    // First try to get from cache (1H timeframe for good balance of detail/range)
    const { data: cached } = await supabase
      .from('chart_timeline_ohlc_cache')
      .select('candles')
      .eq('timeframe', '1H')
      .single()
    
    if (cached?.candles && Array.isArray(cached.candles) && cached.candles.length > 0) {
      console.log(`[ANALYZE] Using cached OHLC data: ${cached.candles.length} candles`)
      return cached.candles as OHLCData[]
    }
    
    // Fallback: fetch from Binance (1H candles, 7 days = 168 candles)
    console.log('[ANALYZE] No cache, fetching from Binance...')
    const url = 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=168'
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

// Downsample OHLC data to max N points (aggregating OHLC properly)
const MAX_PRICE_POINTS = 20

function downsampleOHLC(data: OHLCData[], maxPoints: number = MAX_PRICE_POINTS): OHLCData[] {
  if (data.length <= maxPoints) return data
  
  const chunkSize = Math.ceil(data.length / maxPoints)
  const result: OHLCData[] = []
  
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, Math.min(i + chunkSize, data.length))
    if (chunk.length === 0) continue
    
    // Aggregate: first open, max high, min low, last close
    result.push({
      timestamp: chunk[0].timestamp,
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close
    })
  }
  
  return result
}

// Format price data for AI (with downsampling)
function formatPriceContext(ohlcData: OHLCData[]): { text: string; summary: object } {
  if (ohlcData.length === 0) {
    return { 
      text: 'Keine Preisdaten verfügbar.', 
      summary: { sent: 0 } 
    }
  }
  
  // Downsample to max 20 points
  const sampled = downsampleOHLC(ohlcData, MAX_PRICE_POINTS)
  
  // Calculate summary stats from FULL data
  const firstPrice = ohlcData[0].open
  const lastPrice = ohlcData[ohlcData.length - 1].close
  const change = ((lastPrice - firstPrice) / firstPrice * 100).toFixed(2)
  const high = Math.max(...ohlcData.map(c => c.high))
  const low = Math.min(...ohlcData.map(c => c.low))
  
  const firstDate = new Date(ohlcData[0].timestamp)
  const lastDate = new Date(ohlcData[ohlcData.length - 1].timestamp)
  
  // Calculate effective granularity of sampled data
  const sampledGranularityMs = sampled.length > 1 
    ? (sampled[sampled.length - 1].timestamp - sampled[0].timestamp) / (sampled.length - 1)
    : 0
  const sampledGranularityHours = Math.round(sampledGranularityMs / (1000 * 60 * 60))
  
  // Build summary for logging
  const summary = {
    originalCandles: ohlcData.length,
    sentToAI: sampled.length,
    granularity: `~${sampledGranularityHours}h per point`,
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
  
  // Build text for AI
  const lines: string[] = []
  lines.push(`## BTC Preisentwicklung`)
  lines.push(`Zeitraum: ${firstDate.toLocaleDateString('de-DE')} - ${lastDate.toLocaleDateString('de-DE')}`)
  lines.push(`Start: $${firstPrice.toLocaleString()} | Ende: $${lastPrice.toLocaleString()} | Änderung: ${change}%`)
  lines.push(`Hoch: $${high.toLocaleString()} | Tief: $${low.toLocaleString()}`)
  lines.push('')
  
  // Key price points (downsampled)
  lines.push(`## Preis-Timeline (${sampled.length} Datenpunkte):`)
  for (const candle of sampled) {
    const date = new Date(candle.timestamp).toLocaleString('de-DE', { 
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
    })
    const candleChange = ((candle.close - candle.open) / candle.open * 100).toFixed(1)
    const emoji = candle.close >= candle.open ? '🟢' : '🔴'
    lines.push(`${date}: $${candle.close.toFixed(0)} ${emoji} ${candleChange}%`)
  }
  
  return { text: lines.join('\n'), summary }
}

// Format chat for AI
function formatChatContext(messages: ChatMessage[]): string {
  const lines: string[] = []
  lines.push(`## Chat-Nachrichten (${messages.length}):`)
  
  for (const msg of messages) {
    const text = msg.text.length > 300 ? msg.text.slice(0, 300) + '...' : msg.text
    lines.push(`[${msg.time}] @${msg.username}: ${text}`)
  }
  
  return lines.join('\n')
}

const ANALYSIS_PROMPT = `Du bist ein Chart-Analyst. Finde die besten PREIS-VORHERSAGEN aus dem Chat.

## ZIEL: Finde 8-12 Zitate die auf einem BTC-Chart gut aussehen

### PRIORITÄT 1: Echte Predictions (pump_call, dump_call, top_call, bottom_call)
- "Jetzt Long!" / "Short here!" / "Das ist der Boden" / "Top ist drin"
- Preisprognosen: "100k kommt" / "Wir sehen 80k"
- Timing-Calls: "Heute noch pump" / "Morgen dump"
→ Setze wasCorrect=true/false basierend auf dem tatsächlichen Preisverlauf!

### PRIORITÄT 2: Reaktionen auf Moves (fomo, panic, diamond_hands)
- FOMO während Pump: "Warum bin ich nicht drin?!" / "YOLO ALL IN"
- Panik während Dump: "RIP Portfolio" / "Es ist vorbei"
- Diamond Hands: "HODL!" / "Ich verkaufe nichts"

### PRIORITÄT 3: Analysen (analysis, reversal, sideways)
- TA-Calls: "Breakout incoming" / "Support hält"
- Reversal: "Hier dreht's" / "Trendwende"

## FORMAT für jedes Zitat:
- quote: MAX 50 ZEICHEN! Nur der Kern. Kürze radikal.
- timestamp: Exakt aus dem Chat (ISO format)
- priceAtQuote: BTC-Preis zu dem Zeitpunkt (aus Preis-Timeline schätzen)
- wasCorrect: Bei Predictions IMMER setzen (true/false)
- priceContext: Passende Kategorie wählen

## HEADLINE
Kurz und knackig, max 60 Zeichen. Beispiele:
- "BTC -10%: Panik im Chat"
- "$100k Ausbruch - Bullen feiern"
- "Seitwärts-Qual: Trader verlieren Geduld"

## Best/Worst Call
- bestCall: Die Prediction die am besten gealtert ist
- worstCall: Die Prediction die komplett daneben lag

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
      messageCount: cached.message_count
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
    console.log('[ANALYZE] OHLC data:', { count: ohlcData.length })
    
    // Fetch chat messages
    const { data: messages, error, count } = await supabase
      .from('tv_chat_messages')
      .select('id, username, text, time, user_pic', { count: 'exact' })
      .gte('time', sevenDaysAgo.toISOString())
      .lte('time', now.toISOString())
      .order('time', { ascending: false })
      .limit(800)
    
    if (error) {
      console.error('[ANALYZE] Supabase error:', error)
      return new Response(JSON.stringify({ error: 'Database error' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    console.log('[ANALYZE] Chat messages:', {
      fetched: messages?.length || 0,
      totalInRange: count,
    })
    
    if (!messages || messages.length === 0) {
      console.log('[ANALYZE] No messages found in date range!')
      return new Response(JSON.stringify({ error: 'No messages found' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    const { text: priceContext, summary: priceSummary } = formatPriceContext(ohlcData)
    const chatContext = formatChatContext(messages as ChatMessage[])
    const fullContext = `${priceContext}\n\n${chatContext}`
    
    // Log price data summary
    console.log('[ANALYZE] Price data sent to AI:', JSON.stringify(priceSummary, null, 2))
    console.log('[ANALYZE] Sending to OpenAI...')
    
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
