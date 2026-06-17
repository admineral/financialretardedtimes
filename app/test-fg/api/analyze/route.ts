/**
 * route.ts (Fear & Greed Analysis API)
 * 
 * AI-powered sentiment analysis endpoint using OpenAI GPT-5.2.
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
import { generateDailyAIObject, toLegacyFearGreedResponse } from '@/app/newspaper/lib/daily-ai'

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

## ⛔ IGNORIEREN: RATE CHART GAME TIPPS
Nachrichten die mit "//" und einem Preis beginnen (z.B. //88.5k, //95000, //92K) sind 
SPIELTIPPS und müssen KOMPLETT IGNORIERT werden - nicht für Sentiment-Analyse verwenden!

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
 * Previous Fear & Greed data interface.
 * Used to provide historical context to the AI for continuity.
 */
interface PreviousFearGreed {
  created_at: string
  today_index: number
  today_classification_de: string
  last_3_days_index: number
  last_3_days_classification_de: string
  last_7_days_index: number
  last_7_days_classification_de: string
  trend: string
  insight: string | null
}

/**
 * Fetch the most recent Fear & Greed analysis from history.
 * Used to provide feedback context to the AI model.
 * 
 * @param supabase - Supabase client
 * @returns Previous F&G data or null if none exists
 */
async function fetchPreviousFearGreed(supabase: Awaited<ReturnType<typeof createClient>>): Promise<PreviousFearGreed | null> {
  try {
    const { data, error } = await supabase
      .from('fear_greed_history')
      .select('created_at, today_index, today_classification_de, last_3_days_index, last_3_days_classification_de, last_7_days_index, last_7_days_classification_de, trend, insight')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (error) {
      // No data found is okay, just return null
      if (error.code === 'PGRST116') {
        console.log('[FEAR-GREED] No previous F&G history found')
        return null
      }
      console.warn('[FEAR-GREED] Error fetching previous F&G:', error.message)
      return null
    }
    
    return data as PreviousFearGreed
  } catch (error) {
    console.error('[FEAR-GREED] Error fetching previous F&G:', error)
    return null
  }
}

/**
 * Format previous Fear & Greed data for the AI prompt.
 * 
 * @param prev - Previous F&G data
 * @returns Formatted string with previous analysis context
 */
function formatPreviousFearGreed(prev: PreviousFearGreed): string {
  const prevDate = new Date(prev.created_at)
  const now = new Date()
  const diffMs = now.getTime() - prevDate.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)
  
  let timeAgo: string
  if (diffHours < 1) {
    timeAgo = 'vor weniger als 1 Stunde'
  } else if (diffHours < 24) {
    timeAgo = `vor ${diffHours} Stunde${diffHours > 1 ? 'n' : ''}`
  } else {
    timeAgo = `vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`
  }
  
  const trendDE = prev.trend === 'rising' ? 'steigend' : prev.trend === 'falling' ? 'fallend' : 'stabil'
  
  return `
═══════════════════════════════════════════════════
📊 LETZTE FEAR & GREED ANALYSE (${timeAgo})
═══════════════════════════════════════════════════
• Heute: ${prev.today_index} (${prev.today_classification_de})
• 3 Tage: ${prev.last_3_days_index} (${prev.last_3_days_classification_de})
• 7 Tage: ${prev.last_7_days_index} (${prev.last_7_days_classification_de})
• Trend: ${trendDE}
${prev.insight ? `• Insight: "${prev.insight}"` : ''}
═══════════════════════════════════════════════════

WICHTIG: Berücksichtige diese vorherige Analyse als Kontext. Hat sich die Stimmung 
seitdem verändert? Sind die gleichen Themen noch relevant? Bestätige Kontinuität 
oder erkläre Veränderungen.
`
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
    // Parse request body (no params needed, but consume the body)
    await request.json().catch(() => ({}))

    if (process.env.UNIFIED_DAILY_AI_DELEGATE === 'true') {
      const { object } = await generateDailyAIObject({
        includeNewspaper: false,
        includeTicker: false,
        includeTimeline: false,
        includeFearGreed: true,
        source: 'fear-greed'
      })
      return new Response(
        JSON.stringify(toLegacyFearGreedResponse(object)),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client early for parallel fetches
    const supabase = await createClient()
    
    // Fetch BTC data and previous F&G in parallel with request parsing
    const btcPromise = fetchBTCContext()
    const prevFGPromise = fetchPreviousFearGreed(supabase)
    
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
    
    // Calculate date boundaries for period breakdown (in Europe/Berlin timezone)
    // Get today's date string in Berlin timezone (YYYY-MM-DD)
    const now = new Date()
    const berlinDateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }) // sv-SE gives YYYY-MM-DD
    
    // Create midnight Berlin time - use explicit offset
    // Berlin is CET (UTC+1) in winter, CEST (UTC+2) in summer
    // December = winter = UTC+1
    const todayStartBerlin = new Date(`${berlinDateStr}T00:00:00+01:00`)
    
    const threeDaysAgoBerlin = new Date(todayStartBerlin)
    threeDaysAgoBerlin.setDate(threeDaysAgoBerlin.getDate() - 3)
    
    // Count messages per period
    const todayMessages = allMessages.filter(m => new Date(m.time) >= todayStartBerlin)
    const last3DaysMessages = allMessages.filter(m => new Date(m.time) >= threeDaysAgoBerlin)
    
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
    const todayStr = todayStartBerlin.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' })
    
    // Wait for BTC data and previous F&G
    const [btcContext, prevFG] = await Promise.all([btcPromise, prevFGPromise])
    const btcContextStr = btcContext ? formatBTCContext(btcContext) : ''
    const prevFGContextStr = prevFG ? formatPreviousFearGreed(prevFG) : ''
    
    // Find actual date range from messages
    const oldestMsgDate = allMessages.length > 0 ? new Date(allMessages[0].time) : startDate
    const newestMsgDate = allMessages.length > 0 ? new Date(allMessages[allMessages.length - 1].time) : endDate
    const oldestMsgStr = oldestMsgDate.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', timeZone: 'Europe/Berlin' })
    const newestMsgStr = newestMsgDate.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
    
    // Log summary of what we're sending to the model
    const nowStr = new Date().toLocaleString('de-DE', { 
      day: '2-digit', month: 'short', year: 'numeric', 
      hour: '2-digit', minute: '2-digit', 
      timeZone: 'Europe/Berlin' 
    })
    console.log(`[FEAR-GREED] ════════════════════════════════════════════`)
    console.log(`[FEAR-GREED] 🤖 Sending to model:`)
    if (prevFG) {
      const prevDate = new Date(prevFG.created_at).toLocaleString('de-DE', { 
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' 
      })
      console.log(`[FEAR-GREED]    📜 Previous F&G (${prevDate}): Today=${prevFG.today_index}, 3d=${prevFG.last_3_days_index}, 7d=${prevFG.last_7_days_index}`)
    } else {
      console.log(`[FEAR-GREED]    📜 Previous F&G: None (first analysis)`)
    }
    console.log(`[FEAR-GREED]    🕐 Current time (Berlin): ${nowStr}`)
    console.log(`[FEAR-GREED]    🌅 Today starts at (Berlin midnight): ${todayStartBerlin.toISOString()}`)
    console.log(`[FEAR-GREED]    📅 FIRST message: ${allMessages[0]?.time || 'N/A'} (${oldestMsgStr})`)
    console.log(`[FEAR-GREED]    📅 LAST message:  ${allMessages[allMessages.length - 1]?.time || 'N/A'} (${newestMsgStr})`)
    console.log(`[FEAR-GREED]    Today (${todayStr}): ${todayMessages.length} messages`)
    console.log(`[FEAR-GREED]    Last 3 days: ${last3DaysMessages.length} messages`)
    console.log(`[FEAR-GREED]    Last 7 days: ${allMessages.length} messages`)
    console.log(`[FEAR-GREED]    Unique users: ${uniqueUsers}`)
    if (todayMessages.length === 0) {
      console.log(`[FEAR-GREED]    ⚠️ WARNING: No messages from today!`)
    }
    if (todayMessages.length > 0) {
      const firstTodayMsg = todayMessages[0]
      const lastTodayMsg = todayMessages[todayMessages.length - 1]
      const firstBerlin = new Date(firstTodayMsg.time).toLocaleString('de-DE', { 
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' 
      })
      const lastBerlin = new Date(lastTodayMsg.time).toLocaleString('de-DE', { 
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' 
      })
      console.log(`[FEAR-GREED]    📅 Today's FIRST: ${firstTodayMsg.time} (Berlin: ${firstBerlin})`)
      console.log(`[FEAR-GREED]    📅 Today's LAST:  ${lastTodayMsg.time} (Berlin: ${lastBerlin})`)
    }
    // Log the actual last message content so we can verify
    const lastMsg = allMessages[allMessages.length - 1]
    if (lastMsg) {
      const lastMsgBerlin = new Date(lastMsg.time).toLocaleString('de-DE', { 
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' 
      })
      console.log(`[FEAR-GREED]    💬 LAST MSG: [${lastMsgBerlin}] ${lastMsg.username}: ${lastMsg.text.substring(0, 80)}${lastMsg.text.length > 80 ? '...' : ''}`)
    }
    console.log(`[FEAR-GREED] ════════════════════════════════════════════`)
    
    // Prepare date range info for cache
    const dateRangeInfo = {
      oldestDate: oldestMsgStr,
      newestDate: newestMsgStr,
      todayMessageCount: todayMessages.length
    }
    
    // Stream AI response using GPT-5.2
    const result = streamObject({
      model: openai('gpt-5.4'),
      schema: FearGreedSchema,
      system: FEAR_GREED_PROMPT,
      providerOptions: { openai: { reasoning: { effort: 'high' } } },
      prompt: `Analysiere den folgenden Chat und erstelle Fear & Greed Indices für alle drei Zeiträume.

HEUTE ist der ${todayStr}
${btcContextStr}${prevFGContextStr}
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
          
          // Auto-save to BOTH cache (for fast retrieval) AND history (for tracking over time)
          try {
            const saveSupabase = await createClient()
            const cacheDate = new Date().toISOString().split('T')[0]
            
            // Save to cache (upsert - one per day)
            const cachePromise = saveSupabase
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
            
            // Save to history (insert - every analysis is stored)
            const historyPromise = saveSupabase
              .from('fear_greed_history')
              .insert({
                analysis_date: cacheDate,
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
                message_count: allMessages.length,
                unique_users: uniqueUsers,
                oldest_message_date: dateRangeInfo.oldestDate,
                newest_message_date: dateRangeInfo.newestDate
              })
            
            // Wait for both saves
            const [cacheResult, historyResult] = await Promise.all([cachePromise, historyPromise])
            
            if (cacheResult.error) {
              console.error(`[FEAR-GREED] ⚠️ Failed to save cache:`, cacheResult.error)
            } else {
              console.log(`[FEAR-GREED] ✅ Saved to cache: ${dateRangeInfo.oldestDate} → ${dateRangeInfo.newestDate}`)
            }
            
            if (historyResult.error) {
              console.error(`[FEAR-GREED] ⚠️ Failed to save history:`, historyResult.error)
            } else {
              console.log(`[FEAR-GREED] ✅ Saved to history for tracking over time`)
            }
          } catch (saveError) {
            console.error(`[FEAR-GREED] ⚠️ Failed to save:`, saveError)
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
