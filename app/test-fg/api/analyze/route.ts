/**
 * route.ts (Fear & Greed Analysis API)
 * 
 * AI-powered sentiment analysis endpoint using OpenAI GPT-5.1.
 * 
 * LOCAL: Handles POST requests to analyze chat sentiment and generate
 * Fear & Greed indices for three time periods (today, 3 days, 7 days).
 * Fetches messages from Supabase, adds BTC market context, and streams AI responses.
 * 
 * GLOBAL: Primary API endpoint for the Fear & Greed widget. Called by FearGreedWidget
 * component via useObject hook. Returns streaming JSON matching FearGreedSchema.
 * 
 * ENDPOINT: POST /test-fg/api/analyze
 * 
 * REQUEST BODY: Empty object (no parameters needed)
 * 
 * RESPONSE: Streaming JSON object with sentiment indices for 3 periods
 * 
 * ERRORS:
 * - 500: OpenAI API key not configured
 * - 404: No messages found for the last 7 days
 * - 500: Database or AI errors
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

/**
 * Single period sentiment schema.
 * Represents the Fear & Greed index for one time period.
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
 * Fear & Greed Analysis Schema - All 3 periods in one response.
 * Used for streaming validation and type inference.
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
  
  // Short insight text (1-2 sentences, displayed in widget)
  insight: z.string().describe('Kurze Erklärung der aktuellen Stimmung (max 2 Sätze, deutsch)'),
  
  // Top 2-3 sentiment drivers as short tags
  topDrivers: z.array(z.string()).min(2).max(3).describe('Die 2-3 wichtigsten Stimmungstreiber als kurze Schlagworte'),
})

export type FearGreedData = z.infer<typeof FearGreedSchema>

// ═══════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════

/**
 * System prompt for Fear & Greed sentiment analysis.
 * Instructs the AI on how to calculate indices for each time period.
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
• "insight": 1-2 kurze Sätze die die aktuelle Stimmung erklären
  → Beispiel: "Euphorie wegen ETF-Zuflüssen. Viele erwarten neue ATHs."
  → Beispiel: "Nervosität nach dem Dump. Unsicherheit über nächste Richtung."
• "topDrivers": 2-3 Schlagworte als Stimmungstreiber
  → Beispiel: ["ETF-Zuflüsse", "Halving-Countdown", "Bullishe TA"]
  → Beispiel: ["Makro-Unsicherheit", "Whale-Verkäufe", "Support-Test"]`

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Bitcoin market context interface.
 * Used to provide price context to the AI.
 */
interface BTCContext {
  price: number
  change24h: number
  change7d: number
  change30d: number
}

/**
 * Fetch current Bitcoin market data from CoinGecko API.
 * Used to provide market context to the AI for more relevant analysis.
 * 
 * @returns BTCContext object or null if fetch fails
 */
async function fetchBTCContext(): Promise<BTCContext | null> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false',
      { next: { revalidate: 300 } } // Cache for 5 minutes
    )
    
    if (!response.ok) {
      console.warn('[BTC API] CoinGecko API error:', response.status)
      return null
    }
    
    const data = await response.json()
    const market = data.market_data
    
    return {
      price: Math.round(market.current_price.usd),
      change24h: Math.round(market.price_change_percentage_24h * 100) / 100,
      change7d: Math.round(market.price_change_percentage_7d * 100) / 100,
      change30d: Math.round(market.price_change_percentage_30d * 100) / 100,
    }
  } catch (error) {
    console.error('[BTC API] Error fetching BTC data:', error)
    return null
  }
}

/**
 * Format BTC context as a readable string for the AI prompt.
 * 
 * @param btc - Bitcoin market data
 * @returns Formatted string with price and performance info
 */
function formatBTCContext(btc: BTCContext): string {
  const formatPercent = (pct: number) => (pct >= 0 ? `+${pct}%` : `${pct}%`)
  
  return `
═══════════════════════════════════════════════════
📊 BITCOIN MARKTDATEN (Live)
═══════════════════════════════════════════════════
💰 Aktueller Preis: $${btc.price.toLocaleString('de-DE')}

📈 Performance:
   • 24h: ${formatPercent(btc.change24h)}
   • 7 Tage: ${formatPercent(btc.change7d)}
   • 30 Tage: ${formatPercent(btc.change30d)}
═══════════════════════════════════════════════════
`
}

// ═══════════════════════════════════════════════════════════════════════
// POST HANDLER
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST handler for Fear & Greed sentiment analysis.
 * Fetches 7 days of messages, adds BTC context, and streams AI-generated indices.
 */
export async function POST(request: NextRequest) {
  await headers()
  
  // Validate API key
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
  
  try {
    // Fetch BTC data in parallel with request parsing
    const btcPromise = fetchBTCContext()
    
    // Parse request body (no params needed, but consume the body)
    await request.json().catch(() => ({}))
    
    // Initialize Supabase client
    const supabase = await createClient()
    
    // Calculate date range (last 7 days)
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 7)
    
    // Format dates for logging
    const startDateStr = startDate.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Berlin' })
    const endDateStr = endDate.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Berlin' })
    
    // Fetch chat messages with pagination
    const allMessages: { username: string; text: string; time: string }[] = []
    const pageSize = 1000
    let offset = 0
    let hasMore = true
    
    console.log(`[FEAR-GREED] ════════════════════════════════════════════`)
    console.log(`[FEAR-GREED] 📊 Fetching messages for Fear & Greed analysis`)
    console.log(`[FEAR-GREED] 📅 Date range: ${startDateStr} → ${endDateStr}`)
    console.log(`[FEAR-GREED] ════════════════════════════════════════════`)
    
    while (hasMore) {
      const { data: pageMessages, error } = await supabase
        .from('tv_chat_messages')
        .select('username, text, time')
        .gte('time', startDate.toISOString())
        .lte('time', endDate.toISOString())
        .order('time', { ascending: true })
        .range(offset, offset + pageSize - 1)
      
      if (error) {
        throw new Error(`Database error: ${error.message}`)
      }
      
      if (!pageMessages || pageMessages.length === 0) {
        hasMore = false
      } else {
        allMessages.push(...pageMessages)
        offset += pageSize
        hasMore = pageMessages.length === pageSize
      }
    }
    
    // Validate messages exist
    if (allMessages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No messages found for the last 7 days' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Calculate date boundaries for period breakdown
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const threeDaysAgo = new Date(todayStart)
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    
    // Count messages per period
    const todayMessages = allMessages.filter(m => new Date(m.time) >= todayStart)
    const last3DaysMessages = allMessages.filter(m => new Date(m.time) >= threeDaysAgo)
    
    // Format messages for AI prompt
    const formattedChat = allMessages.map(msg => {
      const time = new Date(msg.time).toLocaleString('de-DE', { 
        hour: '2-digit', 
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        timeZone: 'Europe/Berlin'
      })
      return `[${time}] ${msg.username}: ${msg.text}`
    }).join('\n')
    
    // Calculate statistics
    const uniqueUsers = new Set(allMessages.map(m => m.username)).size
    const todayStr = todayStart.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' })
    
    // Wait for BTC data
    const btcContext = await btcPromise
    const btcContextStr = btcContext ? formatBTCContext(btcContext) : ''
    
    // Find actual date range from messages
    const oldestMsgDate = allMessages.length > 0 ? new Date(allMessages[0].time) : startDate
    const newestMsgDate = allMessages.length > 0 ? new Date(allMessages[allMessages.length - 1].time) : endDate
    const oldestMsgStr = oldestMsgDate.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', timeZone: 'Europe/Berlin' })
    const newestMsgStr = newestMsgDate.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
    
    // Log summary of what we're sending to the model
    console.log(`[FEAR-GREED] ════════════════════════════════════════════`)
    console.log(`[FEAR-GREED] 🤖 Sending to model:`)
    console.log(`[FEAR-GREED]    📅 Actual data range: ${oldestMsgStr} → ${newestMsgStr}`)
    console.log(`[FEAR-GREED]    Today (${todayStr}): ${todayMessages.length} messages`)
    console.log(`[FEAR-GREED]    Last 3 days: ${last3DaysMessages.length} messages`)
    console.log(`[FEAR-GREED]    Last 7 days: ${allMessages.length} messages`)
    console.log(`[FEAR-GREED]    Unique users: ${uniqueUsers}`)
    if (todayMessages.length === 0) {
      console.log(`[FEAR-GREED]    ⚠️ WARNING: No messages from today!`)
    }
    console.log(`[FEAR-GREED] ════════════════════════════════════════════`)
    
    // Prepare date range info for cache
    const dateRangeInfo = {
      oldestDate: oldestMsgStr,
      newestDate: newestMsgStr,
      todayMessageCount: todayMessages.length
    }
    
    // Stream AI response using GPT-5.1
    const result = streamObject({
      model: openai('gpt-5.1'),
      schema: FearGreedSchema,
      system: FEAR_GREED_PROMPT,
      prompt: `Analysiere den folgenden Chat und erstelle Fear & Greed Indices für alle drei Zeiträume.

HEUTE ist der ${todayStr}
${btcContextStr}
Nachrichten-Statistik:
• Heute: ${todayMessages.length} Nachrichten
• Letzte 3 Tage: ${last3DaysMessages.length} Nachrichten  
• Letzte 7 Tage: ${allMessages.length} Nachrichten
• Unique Users: ${uniqueUsers}

Chat-Protokoll (chronologisch, älteste zuerst):

${formattedChat}`,
      onFinish: async ({ object, error: finishError }) => {
        if (object) {
          console.log(`[FEAR-GREED] ✅ Analysis complete: Today=${object.today?.index}, 3d=${object.last3Days?.index}, 7d=${object.last7Days?.index}`)
          
          // Auto-save to cache with date range info
          try {
            const cacheSupabase = await createClient()
            const cacheDate = new Date().toISOString().split('T')[0]
            
            await cacheSupabase
              .from('fear_greed_cache')
              .upsert({
                cache_date: cacheDate,
                today_index: object.today.index,
                today_classification: object.today.classification,
                today_classification_de: object.today.classificationDE,
                last_3_days_index: object.last3Days.index,
                last_3_days_classification: object.last3Days.classification,
                last_3_days_classification_de: object.last3Days.classificationDE,
                last_7_days_index: object.last7Days.index,
                last_7_days_classification: object.last7Days.classification,
                last_7_days_classification_de: object.last7Days.classificationDE,
                trend: object.trend,
                insight: object.insight,
                top_drivers: object.topDrivers,
                full_data: {
                  insight: object.insight,
                  topDrivers: object.topDrivers,
                  dateRange: dateRangeInfo
                },
                message_count: allMessages.length,
                unique_users: uniqueUsers,
                updated_at: new Date().toISOString()
              }, {
                onConflict: 'cache_date'
              })
            
            console.log(`[FEAR-GREED] ✅ Auto-saved to cache with date range: ${dateRangeInfo.oldestDate} → ${dateRangeInfo.newestDate}`)
          } catch (cacheError) {
            console.error(`[FEAR-GREED] ⚠️ Failed to auto-save cache:`, cacheError)
          }
        } else if (finishError) {
          console.error(`[FEAR-GREED] ❌ Schema error:`, String(finishError))
        }
      },
      onError: (error) => {
        console.error('[FEAR-GREED] ❌ Stream error:', error)
      }
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
