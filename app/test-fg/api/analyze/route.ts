/**
 * route.ts (Fear & Greed Analysis API)
 * 
 * AI-powered sentiment analysis endpoint that analyzes chat messages
 * and returns Fear & Greed indices for TODAY, LAST 3 DAYS, and LAST 7 DAYS.
 * 
 * ENDPOINT: POST /test-fg/api/analyze
 * 
 * RESPONSE: Streaming JSON with all three time periods
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { z } from 'zod'

/**
 * Single period sentiment schema
 */
const PeriodSentimentSchema = z.object({
  index: z.number().min(0).max(100),
  classification: z.enum([
    'Extreme Fear',
    'Fear', 
    'Neutral',
    'Greed',
    'Extreme Greed'
  ]),
  classificationDE: z.enum([
    'Extreme Angst',
    'Angst',
    'Neutral', 
    'Gier',
    'Extreme Gier'
  ]),
})

/**
 * Fear & Greed Analysis Schema - All 3 periods in one response
 */
export const FearGreedSchema = z.object({
  // Today's sentiment
  today: PeriodSentimentSchema,
  
  // Last 3 days sentiment
  last3Days: PeriodSentimentSchema,
  
  // Last 7 days sentiment (overall)
  last7Days: PeriodSentimentSchema,
  
  // Trend direction based on comparison
  trend: z.enum(['rising', 'falling', 'stable']),
  trendInsight: z.string(), // e.g. "Stimmung verbessert sich seit 3 Tagen"
  
  // Key sentiment drivers (from the full 7 day period)
  drivers: z.array(z.object({
    factor: z.string(),
    sentiment: z.enum(['bullish', 'bearish', 'neutral']),
    weight: z.number().min(0).max(100),
    insight: z.string()
  })).min(3).max(5),
  
  // Notable quotes (from any period)
  quotes: z.array(z.object({
    username: z.string(),
    text: z.string(),
    sentiment: z.enum(['bullish', 'bearish', 'neutral']),
    period: z.enum(['today', 'last3Days', 'last7Days'])
  })).min(3).max(6),
  
  // Overall summary
  summary: z.string()
})

export type FearGreedData = z.infer<typeof FearGreedSchema>

/**
 * System prompt for Fear & Greed analysis
 */
const FEAR_GREED_PROMPT = `Du bist ein Sentiment-Analyst für den TradingView Bitcoin-Chat.

Deine Aufgabe: Analysiere die Chat-Nachrichten und erstelle Fear & Greed Indices für DREI Zeiträume:
1. HEUTE (nur heutige Nachrichten)
2. LETZTE 3 TAGE
3. LETZTE 7 TAGE (Gesamtbild)

═══════════════════════════════════════════════════════════════════════
FEAR & GREED SKALA (0-100)
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
WICHTIG: ZEITRAUM-UNTERSCHEIDUNG
═══════════════════════════════════════════════════════════════════════

Die Nachrichten haben Zeitstempel im Format [DD.MM, HH:MM].
Nutze diese um die Stimmung für jeden Zeitraum SEPARAT zu berechnen:

• TODAY: Nur Nachrichten von heute
• LAST 3 DAYS: Nachrichten der letzten 3 Tage (inkl. heute)
• LAST 7 DAYS: Alle Nachrichten (Gesamtbild)

Der TREND ergibt sich aus dem Vergleich:
- rising: heute > 3 Tage > 7 Tage (Stimmung verbessert sich)
- falling: heute < 3 Tage < 7 Tage (Stimmung verschlechtert sich)
- stable: keine klare Richtung

═══════════════════════════════════════════════════════════════════════
ANALYSE-FAKTOREN
═══════════════════════════════════════════════════════════════════════

1. PREIS-DISKUSSION
   - Preiserwartungen und -ziele
   - Reaktionen auf Bewegungen

2. TECHNISCHE ANALYSE
   - Bullishe vs. bearishe Muster
   - Support/Resistance

3. STIMMUNG & TON
   - Optimismus vs. Pessimismus
   - Humor vs. Frustration

4. HANDELSVERHALTEN
   - Long vs. Short
   - Kaufen vs. Verkaufen

5. MARKT-NARRATIVE
   - Bullrun vs. Bärenmarkt
   - Makro-Einschätzungen

═══════════════════════════════════════════════════════════════════════
OUTPUT-REGELN
═══════════════════════════════════════════════════════════════════════

• Gib für JEDEN Zeitraum einen separaten Index (0-100)
• Die Werte können unterschiedlich sein!
• Belege mit Zitaten aus verschiedenen Zeiträumen
• Erkläre den Trend zwischen den Perioden
• Kurze, prägnante Insights`

/**
 * Fetch BTC context
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
      change30d: Math.round(market.price_change_percentage_30d * 100) / 100,
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
    
    // We don't need body params anymore - always fetch 7 days
    await request.json().catch(() => ({}))
    
    const supabase = await createClient()
    
    // Always fetch last 7 days
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 7)
    
    // Fetch messages
    const allMessages: { username: string; text: string; time: string }[] = []
    const pageSize = 1000
    let offset = 0
    let hasMore = true
    
    console.log(`[FEAR-GREED] 📊 Fetching last 7 days for multi-period analysis`)
    
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
    
    // Calculate date boundaries for context
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const threeDaysAgo = new Date(todayStart)
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    
    // Count messages per period
    const todayMessages = allMessages.filter(m => new Date(m.time) >= todayStart)
    const last3DaysMessages = allMessages.filter(m => new Date(m.time) >= threeDaysAgo)
    
    // Format messages with timestamps
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
      ? `\n\n📊 Aktuelle BTC-Daten: $${btcContext.price.toLocaleString()} (24h: ${btcContext.change24h >= 0 ? '+' : ''}${btcContext.change24h}%, 7d: ${btcContext.change7d >= 0 ? '+' : ''}${btcContext.change7d}%, 30d: ${btcContext.change30d >= 0 ? '+' : ''}${btcContext.change30d}%)`
      : ''
    
    const todayStr = todayStart.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
    
    console.log(`[FEAR-GREED] 📨 Messages: Today=${todayMessages.length}, 3d=${last3DaysMessages.length}, 7d=${allMessages.length}`)
    
    const result = streamObject({
      model: openai('gpt-4o'),
      schema: FearGreedSchema,
      system: FEAR_GREED_PROMPT,
      prompt: `Analysiere den folgenden Chat und erstelle Fear & Greed Indices für alle drei Zeiträume.

HEUTE ist der ${todayStr}

Nachrichten-Statistik:
• Heute: ${todayMessages.length} Nachrichten
• Letzte 3 Tage: ${last3DaysMessages.length} Nachrichten  
• Letzte 7 Tage: ${allMessages.length} Nachrichten
• Unique Users: ${uniqueUsers}
${btcInfo}

Chat-Protokoll (chronologisch, älteste zuerst):

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
