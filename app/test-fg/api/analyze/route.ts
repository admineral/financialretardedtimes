/**
 * route.ts (Fear & Greed Analysis API)
 * 
 * AI-powered sentiment analysis endpoint that analyzes chat messages
 * and returns a Fear & Greed index with structured insights.
 * 
 * ENDPOINT: POST /test-fg/api/analyze
 * 
 * REQUEST BODY:
 * - days: number (1, 3, or 7) - How many days to analyze
 * 
 * RESPONSE: Streaming JSON matching FearGreedSchema
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { z } from 'zod'

/**
 * Fear & Greed Analysis Schema
 */
export const FearGreedSchema = z.object({
  // Overall index (0-100, 0 = Extreme Fear, 100 = Extreme Greed)
  index: z.number().min(0).max(100),
  
  // Classification
  classification: z.enum([
    'Extreme Fear',
    'Fear', 
    'Neutral',
    'Greed',
    'Extreme Greed'
  ]),
  
  // German classification for display
  classificationDE: z.enum([
    'Extreme Angst',
    'Angst',
    'Neutral', 
    'Gier',
    'Extreme Gier'
  ]),
  
  // Trend compared to previous period
  trend: z.enum(['rising', 'falling', 'stable']),
  
  // Key sentiment drivers
  drivers: z.array(z.object({
    factor: z.string(), // e.g. "Price Action", "Volume Discussion", "Technical Analysis"
    sentiment: z.enum(['bullish', 'bearish', 'neutral']),
    weight: z.number().min(0).max(100), // How much this factor contributed
    insight: z.string() // Brief explanation
  })).min(3).max(6),
  
  // Notable quotes that reflect the sentiment
  quotes: z.array(z.object({
    username: z.string(),
    text: z.string(),
    sentiment: z.enum(['bullish', 'bearish', 'neutral'])
  })).min(2).max(5),
  
  // Summary paragraph
  summary: z.string(),
  
  // Comparison insights for multi-day analysis
  periodComparison: z.object({
    today: z.number().min(0).max(100).optional(),
    last3Days: z.number().min(0).max(100).optional(),
    last7Days: z.number().min(0).max(100).optional(),
    insight: z.string()
  }).optional()
})

export type FearGreedData = z.infer<typeof FearGreedSchema>

/**
 * System prompt for Fear & Greed analysis
 */
const FEAR_GREED_PROMPT = `Du bist ein Sentiment-Analyst für den TradingView Bitcoin-Chat.

Deine Aufgabe: Analysiere die Chat-Nachrichten und erstelle einen Fear & Greed Index (0-100).

═══════════════════════════════════════════════════════════════════════
FEAR & GREED SKALA
═══════════════════════════════════════════════════════════════════════

0-20:   Extreme Fear (Extreme Angst)
        → Panik, Kapitulation, "alles ist verloren", Verkaufsrufe
        
21-40:  Fear (Angst)  
        → Nervosität, Unsicherheit, mehr bearish als bullish
        
41-60:  Neutral
        → Ausgeglichen, abwartend, keine klare Richtung
        
61-80:  Greed (Gier)
        → Optimismus, Kaufdruck, bullishe Erwartungen
        
81-100: Extreme Greed (Extreme Gier)
        → Euphorie, FOMO, "to the moon", übertriebene Preisziele

═══════════════════════════════════════════════════════════════════════
ANALYSE-FAKTOREN
═══════════════════════════════════════════════════════════════════════

Berücksichtige diese Faktoren für deine Analyse:

1. PREIS-DISKUSSION
   - Werden steigende oder fallende Preise erwartet?
   - Welche Preisziele werden genannt?
   - Wie reagiert der Chat auf Preisbewegungen?

2. TECHNISCHE ANALYSE
   - Bullishe vs. bearishe Chartmuster
   - Support/Resistance Diskussionen
   - Indikator-Interpretationen (RSI, MACD, etc.)

3. STIMMUNG & TON
   - Allgemeine Stimmungslage im Chat
   - Humor vs. Frustration
   - Selbstbewusstsein vs. Unsicherheit

4. HANDELSVERHALTEN
   - Long vs. Short Positionen
   - Kaufen vs. Verkaufen
   - Warten vs. Handeln

5. MARKT-NARRATIVE
   - Bullrun vs. Bärenmarkt Diskussionen
   - Makro-Einschätzungen
   - Vergleiche mit historischen Situationen

═══════════════════════════════════════════════════════════════════════
OUTPUT-REGELN
═══════════════════════════════════════════════════════════════════════

• Sei präzise: Der Index sollte die tatsächliche Stimmung widerspiegeln
• Belege mit Zitaten: Wähle repräsentative Zitate aus dem Chat
• Erkläre die Drivers: Was treibt die Stimmung?
• Sei neutral: Berichte, was ist – nicht was sein sollte
• Kurze Insights: Max 1-2 Sätze pro Driver/Quote

Bei Multi-Tag-Analysen:
• Vergleiche die Stimmung über die Tage
• Erkenne Trends (steigend/fallend/stabil)
• Gib Kontext zur Entwicklung`

/**
 * Fetch BTC context for additional market data
 */
async function fetchBTCContext() {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false',
      { next: { revalidate: 300 } }
    )
    
    if (!response.ok) return null
    
    const data = await response.json()
    const market = data.market_data
    
    return {
      price: Math.round(market.current_price.usd),
      change24h: Math.round(market.price_change_percentage_24h * 100) / 100,
      change7d: Math.round(market.price_change_percentage_7d * 100) / 100,
    }
  } catch {
    return null
  }
}

/**
 * POST handler for Fear & Greed analysis
 */
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
    const btcPromise = fetchBTCContext()
    const body = await request.json()
    const { days = 7 }: { days?: number } = body
    
    const supabase = await createClient()
    
    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    
    // Fetch messages
    const allMessages: { username: string; text: string; time: string }[] = []
    const pageSize = 1000
    let offset = 0
    let hasMore = true
    
    console.log(`[FEAR-GREED] 📊 Analyzing last ${days} days`)
    
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
        JSON.stringify({ error: 'No messages found for the selected period' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Format messages
    const formattedChat = allMessages.map(msg => {
      const time = new Date(msg.time).toLocaleString('de-DE', { 
        hour: '2-digit', 
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit'
      })
      return `[${time}] ${msg.username}: ${msg.text}`
    }).join('\n')
    
    const uniqueUsers = new Set(allMessages.map(m => m.username)).size
    const btcContext = await btcPromise
    
    const btcInfo = btcContext 
      ? `\n\n📊 Aktuelle BTC-Daten: $${btcContext.price.toLocaleString()} (24h: ${btcContext.change24h >= 0 ? '+' : ''}${btcContext.change24h}%, 7d: ${btcContext.change7d >= 0 ? '+' : ''}${btcContext.change7d}%)`
      : ''
    
    console.log(`[FEAR-GREED] 📨 Sending ${allMessages.length} messages from ${uniqueUsers} users to AI`)
    
    const result = streamObject({
      model: openai('gpt-4o'),
      schema: FearGreedSchema,
      system: FEAR_GREED_PROMPT,
      prompt: `Analysiere den folgenden Chat und erstelle einen Fear & Greed Index.

Zeitraum: Letzte ${days} Tag(e)
Nachrichten: ${allMessages.length}
Unique Users: ${uniqueUsers}
${btcInfo}

Chat-Protokoll:

${formattedChat}`
    })
    
    return result.toTextStreamResponse()
    
  } catch (error) {
    console.error('[FEAR-GREED API] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

