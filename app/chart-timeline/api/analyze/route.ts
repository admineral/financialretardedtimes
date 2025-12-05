/**
 * route.ts (Chart Timeline AI Analysis)
 * 
 * AI-powered analysis that correlates chat messages with BTC price action.
 * Fetches price data first, then analyzes chat to find relevant quotes
 * that relate to price movements (drops, pumps, sideways, etc.)
 * 
 * ENDPOINT: POST /chart-timeline/api/analyze
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { z } from 'zod'

// Schema for price-correlated quotes
const ChartQuoteSchema = z.object({
  id: z.string(),
  timestamp: z.string(), // ISO format datetime
  username: z.string(),
  quote: z.string(), // The actual quote text - keep it short and impactful
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
  wasCorrect: z.boolean().optional(), // If prediction, was it correct?
  priceAtQuote: z.number(), // BTC price when quote was made
})

const AnalysisResponseSchema = z.object({
  headline: z.string(), // Main headline summarizing the period
  subheadline: z.string(), // Secondary context
  priceChange: z.object({
    startPrice: z.number(),
    endPrice: z.number(),
    changePercent: z.number(),
    trend: z.enum(['bullish', 'bearish', 'sideways'])
  }),
  quotes: z.array(ChartQuoteSchema).min(8).max(15),
  bestCall: z.object({
    username: z.string(),
    quote: z.string(),
    context: z.string()
  }).optional(),
  worstCall: z.object({
    username: z.string(),
    quote: z.string(),
    context: z.string()
  }).optional()
})

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

// Fetch OHLC data
async function fetchOHLCData(days: number = 7): Promise<OHLCData[]> {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=${days}`
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 300 }
    })
    
    if (!response.ok) return []
    
    const rawData: [number, number, number, number, number][] = await response.json()
    return rawData.map(([timestamp, open, high, low, close]) => ({
      timestamp, open, high, low, close
    }))
  } catch (error) {
    console.error('[ANALYZE] OHLC fetch error:', error)
    return []
  }
}

// Format price data for AI
function formatPriceContext(ohlcData: OHLCData[]): string {
  if (ohlcData.length === 0) return 'Keine Preisdaten verfügbar.'
  
  const lines: string[] = []
  const firstPrice = ohlcData[0].open
  const lastPrice = ohlcData[ohlcData.length - 1].close
  const change = ((lastPrice - firstPrice) / firstPrice * 100).toFixed(2)
  const high = Math.max(...ohlcData.map(c => c.high))
  const low = Math.min(...ohlcData.map(c => c.low))
  
  lines.push(`## BTC Preisentwicklung (7 Tage)`)
  lines.push(`Start: $${firstPrice.toLocaleString()} | Ende: $${lastPrice.toLocaleString()} | Änderung: ${change}%`)
  lines.push(`Hoch: $${high.toLocaleString()} | Tief: $${low.toLocaleString()}`)
  lines.push('')
  
  // Key price points with timestamps
  lines.push(`## Preis-Timeline:`)
  for (let i = 0; i < ohlcData.length; i += Math.max(1, Math.floor(ohlcData.length / 20))) {
    const candle = ohlcData[i]
    const date = new Date(candle.timestamp).toISOString()
    lines.push(`${date}: $${candle.close.toFixed(0)}`)
  }
  
  // Significant moves
  lines.push('')
  lines.push(`## Signifikante Bewegungen:`)
  for (let i = 1; i < ohlcData.length; i++) {
    const prev = ohlcData[i - 1]
    const curr = ohlcData[i]
    const movePercent = ((curr.close - prev.close) / prev.close * 100)
    
    if (Math.abs(movePercent) > 2) {
      const date = new Date(curr.timestamp).toISOString()
      const direction = movePercent > 0 ? '📈 PUMP' : '📉 DUMP'
      lines.push(`${date}: ${direction} ${movePercent.toFixed(1)}%`)
    }
  }
  
  return lines.join('\n')
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

const ANALYSIS_PROMPT = `Du bist ein Analyst für die "Financial Retarded Times" - eine humorvolle Zeitung über die TradingView Bitcoin-Community.

Deine Aufgabe: Analysiere die Chat-Nachrichten im Kontext der BTC-Preisentwicklung und finde die besten ZITATE.

## Was du tun sollst:

1. **Headline erstellen**: Schreibe eine knackige, zeitungsartige Überschrift die die Woche zusammenfasst (z.B. "BTC crasht 10% - Community in Panik" oder "Rallye zu $100k - Bullen feiern")

2. **Zitate finden**: Suche 10-15 der besten Zitate aus dem Chat:
   - Leute die einen Pump/Dump vorhergesagt haben
   - FOMO-Aussagen während eines Pumps  
   - Panik-Aussagen während eines Dumps
   - "Diamond Hands" Kommentare
   - Witzige oder ironische Bemerkungen
   - Technische Analysen die richtig/falsch waren

3. **Für jedes Zitat**:
   - Halte das Zitat KURZ (max 80 Zeichen) - nur den Kern der Aussage
   - Gib den genauen Timestamp aus dem Chat
   - Schätze den BTC Preis zu dem Zeitpunkt
   - War die Vorhersage korrekt? (falls zutreffend)

4. **Best/Worst Call**: Wer hatte den besten und schlechtesten Call der Woche?

## Stil:
- Sei unterhaltsam und leicht ironisch
- Deutsche Headlines und Kontext
- Zitate können Deutsch oder Englisch sein (wie im Original-Chat)
- Fokus auf Entertainment, nicht Finanzberatung

Antworte NUR mit dem JSON-Schema, keine zusätzlichen Erklärungen.`

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const supabase = await createClient()
    
    console.log('[ANALYZE] Fetching data...')
    const ohlcData = await fetchOHLCData(7)
    
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    const { data: messages, error } = await supabase
      .from('tv_chat_messages')
      .select('id, username, text, time, user_pic')
      .gte('time', sevenDaysAgo.toISOString())
      .order('time', { ascending: true })
      .limit(400)
    
    if (error || !messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'No messages found' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    console.log(`[ANALYZE] Got ${ohlcData.length} candles, ${messages.length} messages`)
    
    const priceContext = formatPriceContext(ohlcData)
    const chatContext = formatChatContext(messages as ChatMessage[])
    const fullContext = `${priceContext}\n\n${chatContext}`
    
    const result = streamObject({
      model: openai('gpt-4o-mini'),
      schema: AnalysisResponseSchema,
      system: ANALYSIS_PROMPT,
      prompt: fullContext,
      temperature: 0.8,
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
