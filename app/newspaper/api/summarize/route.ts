/**
 * route.ts (summarize API)
 * 
 * AI-powered chat summarization endpoint using OpenAI GPT-5.
 * 
 * LOCAL: Handles POST requests to generate newspaper-style content from chat messages.
 * Fetches messages from Supabase, adds BTC market context, and streams AI responses.
 * Automatically caches completed responses in Supabase for future requests.
 * 
 * GLOBAL: Primary API endpoint for the newspaper feature. Called by NewspaperContent
 * component via useObject hook. Returns streaming JSON matching UnifiedNewspaperSchema.
 * 
 * ENDPOINT: POST /newspaper/api/summarize
 * 
 * REQUEST BODY:
 * - selectedDates?: string[] - Array of dates to fetch messages for (YYYY-MM-DD)
 * 
 * RESPONSE: Streaming JSON object matching UnifiedNewspaperSchema
 * 
 * ERRORS:
 * - 500: OpenAI API key not configured
 * - 404: No messages found for selected dates
 * - 500: Database or AI errors
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { UnifiedNewspaperSchema, UNIFIED_PROMPT, type BTCContext } from '../../lib/schemas'
import type { UnifiedNewspaperData } from '../../lib/types'

/**
 * Save generated newspaper content to cache.
 * Called after streaming completes successfully.
 */
async function saveToCache(
  date: string,
  data: UnifiedNewspaperData,
  messageCount: number,
  uniqueUsers: number
): Promise<void> {
  try {
    const supabase = await createClient()
    
    const { error } = await supabase
      .from('newspaper_cache')
      .upsert({
        cache_date: date,
        data: data,
        message_count: messageCount,
        unique_users: uniqueUsers,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'cache_date'
      })
    
    if (error) {
      console.error('[CACHE] Error saving to cache:', error)
    } else {
      console.log(`[CACHE] ✅ Saved newspaper content for ${date} to cache`)
    }
  } catch (error) {
    console.error('[CACHE] Error saving to cache:', error)
  }
}

/**
 * Fetch current Bitcoin market data from CoinGecko API.
 * Used to provide market context to the AI for more relevant summaries.
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
      currentPrice: Math.round(market.current_price.usd),
      priceEUR: Math.round(market.current_price.eur),
      change24h: Math.round(market.price_change_percentage_24h * 100) / 100,
      high24h: Math.round(market.high_24h.usd),
      low24h: Math.round(market.low_24h.usd),
      volume24h: Math.round(market.total_volume.usd),
      change7d: Math.round(market.price_change_percentage_7d * 100) / 100,
      change30d: Math.round(market.price_change_percentage_30d * 100) / 100,
      athPrice: Math.round(market.ath.usd),
      athDate: market.ath_date.usd.split('T')[0],
      lastUpdated: new Date().toISOString()
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
 * @returns Formatted string with price, performance, and ATH info
 */
function formatBTCContext(btc: BTCContext): string {
  const formatPrice = (price: number) => price.toLocaleString('de-DE')
  const formatPercent = (pct: number) => (pct >= 0 ? `+${pct}%` : `${pct}%`)
  const formatVolume = (vol: number) => {
    if (vol >= 1e9) return `$${(vol / 1e9).toFixed(1)} Mrd.`
    if (vol >= 1e6) return `$${(vol / 1e6).toFixed(1)} Mio.`
    return `$${formatPrice(vol)}`
  }
  
  return `
═══════════════════════════════════════════════════
📊 BITCOIN MARKTDATEN (Live)
═══════════════════════════════════════════════════
💰 Aktueller Preis: $${formatPrice(btc.currentPrice)} (€${formatPrice(btc.priceEUR)})

📈 Performance:
   • 24h: ${formatPercent(btc.change24h)}
   • 7 Tage: ${formatPercent(btc.change7d)}
   • 30 Tage: ${formatPercent(btc.change30d)}

📉 24h Range: $${formatPrice(btc.low24h)} - $${formatPrice(btc.high24h)}
📊 24h Volumen: ${formatVolume(btc.volume24h)}

🏆 All-Time High: $${formatPrice(btc.athPrice)} (${btc.athDate})
═══════════════════════════════════════════════════
`
}

/**
 * POST handler for chat summarization.
 * Fetches messages, adds context, and streams AI-generated content.
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
    
    // Parse request body
    const body = await request.json()
    const { selectedDates }: { selectedDates?: string[] } = body
    
    // Initialize Supabase client
    const supabase = await createClient()
    
    // Fetch chat messages
    let messages: { username: string; text: string; time: string; is_moderator: boolean }[] = []
    
    if (selectedDates && selectedDates.length > 0) {
      // Fetch messages for specific dates
      const allMessages: typeof messages = []
      
      for (const date of selectedDates) {
        const startOfDay = `${date}T00:00:00.000Z`
        const endOfDay = `${date}T23:59:59.999Z`
        
        const { data: dayMessages, error: dayError } = await supabase
          .from('tv_chat_messages')
          .select('username, text, time, is_moderator')
          .gte('time', startOfDay)
          .lte('time', endOfDay)
          .order('time', { ascending: true })
        
        if (dayError) {
          throw new Error(`Database error for date ${date}: ${dayError.message}`)
        }
        
        if (dayMessages) {
          allMessages.push(...dayMessages)
        }
      }
      
      // Sort all messages chronologically
      messages = allMessages.sort((a, b) => 
        new Date(a.time).getTime() - new Date(b.time).getTime()
      )
    } else {
      // Fetch recent messages (last 500)
      const { data: allMessages, error } = await supabase
        .from('tv_chat_messages')
        .select('username, text, time, is_moderator')
        .order('time', { ascending: false })
        .limit(500)
      
      if (error) {
        throw new Error(`Database error: ${error.message}`)
      }
      
      messages = (allMessages || []).reverse()
    }
    
    // Validate messages exist
    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No messages found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Format messages for AI prompt
    const formattedChat = messages.map(msg => {
      const time = new Date(msg.time).toLocaleString('de-DE', { 
        hour: '2-digit', 
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit'
      })
      const modBadge = msg.is_moderator ? ' [MOD]' : ''
      return `[${time}] ${msg.username}${modBadge}: ${msg.text}`
    }).join('\n')
    
    const today = new Date().toISOString().split('T')[0]
    
    // Calculate statistics
    const uniqueUsers = new Set(messages.map(m => m.username)).size
    
    let dateRangeStr = ''
    if (messages.length > 0) {
      const firstDate = new Date(messages[0].time)
      const lastDate = new Date(messages[messages.length - 1].time)
      const daysDiff = Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24))
      dateRangeStr = daysDiff <= 1 ? '1 Tag' : `${daysDiff} Tage`
    }
    
    // Wait for BTC data
    const btcContext = await btcPromise
    const btcContextStr = btcContext ? formatBTCContext(btcContext) : ''
    
    // Log request summary
    console.log(`[SUMMARIZE API] ═══════════════════════════════════════`)
    console.log(`[SUMMARIZE API] 📊 Request Summary:`)
    console.log(`[SUMMARIZE API]   Dates: ${!selectedDates || selectedDates.length === 0 ? 'Recent' : selectedDates.join(', ')}`)
    console.log(`[SUMMARIZE API]   📨 Messages: ${messages.length}`)
    console.log(`[SUMMARIZE API]   👥 Unique Users: ${uniqueUsers}`)
    console.log(`[SUMMARIZE API]   📅 Date Span: ${dateRangeStr}`)
    if (messages.length > 0) {
      const firstMsgTime = new Date(messages[0].time).toLocaleString('de-DE')
      const lastMsgTime = new Date(messages[messages.length - 1].time).toLocaleString('de-DE')
      console.log(`[SUMMARIZE API]   ⏰ Time Range: ${firstMsgTime} → ${lastMsgTime}`)
    }
    if (btcContext) {
      console.log(`[SUMMARIZE API]   💰 BTC: $${btcContext.currentPrice.toLocaleString()} (${btcContext.change24h >= 0 ? '+' : ''}${btcContext.change24h}% 24h)`)
    }
    console.log(`[SUMMARIZE API] ═══════════════════════════════════════`)
    
    // Determine the cache date (use first selected date or today)
    const cacheDate = selectedDates && selectedDates.length > 0 
      ? selectedDates[0] 
      : today
    
    // Stream AI response using GPT-5.1
    // maxOutputTokens set high to ensure full schema completion (shortNews, moreArticles at end)
    const result = streamObject({
      model: openai('gpt-5.1'),
      schema: UnifiedNewspaperSchema,
      system: UNIFIED_PROMPT,
      maxOutputTokens: 8192,
      prompt: `Analysiere den folgenden Chat und erstelle eine übersichtliche Zusammenfassung.

Heutiges Datum: ${today}
${btcContextStr}
Chat-Protokoll (${messages.length} Nachrichten von ${uniqueUsers} Usern):

${formattedChat}`,
      onFinish: async ({ object }) => {
        // Save completed response to cache
        if (object) {
          await saveToCache(cacheDate, object as UnifiedNewspaperData, messages.length, uniqueUsers)
        }
      },
      onError: (error) => {
        console.error('[SUMMARIZE API] Stream error:', error)
      }
    })
    
    return result.toTextStreamResponse()
    
  } catch (error) {
    console.error('[SUMMARIZE API] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

