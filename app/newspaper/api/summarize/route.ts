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
 * 
 * @param date - The start date for the cache entry
 * @param dayRange - Number of days (1, 3, or 7)
 * @param data - The generated newspaper data
 * @param messageCount - Total messages used
 * @param uniqueUsers - Unique user count
 */
async function saveToCache(
  date: string,
  dayRange: number,
  data: UnifiedNewspaperData,
  messageCount: number,
  uniqueUsers: number
): Promise<void> {
  try {
    const supabase = await createClient()
    
    // Try to save with day_range first
    const { error } = await supabase
      .from('newspaper_cache')
      .upsert({
        cache_date: date,
        day_range: dayRange,
        data: data,
        message_count: messageCount,
        unique_users: uniqueUsers,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'cache_date,day_range'
      })
    
    if (error) {
      // If day_range column doesn't exist yet, try without it
      if (error.code === '42703' || error.message?.includes('day_range')) {
        console.log('[CACHE] ⚠️ day_range column not found, saving without it')
        const { error: fallbackError } = await supabase
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
        
        if (fallbackError) {
          console.error('[CACHE] ❌ Fallback save failed:', fallbackError.message)
        } else {
          console.log(`[CACHE] ✅ Saved (legacy): ${date}`)
        }
        return
      }
      
      console.error('[CACHE] ❌ Save failed:', error.message)
    } else {
      console.log(`[CACHE] ✅ Saved: ${date} (${dayRange}d)`)
    }
  } catch (error) {
    console.error('[CACHE] ❌ Exception:', error instanceof Error ? error.message : error)
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
    const { selectedDates, dayRange = 1 }: { selectedDates?: string[]; dayRange?: number } = body
    
    // Initialize Supabase client
    const supabase = await createClient()
    
    // Fetch chat messages
    let messages: { username: string; text: string; time: string; is_moderator: boolean; user_pic?: string | null }[] = []
    
    // Track per-day statistics for logging
    const dayStats: { date: string; count: number; firstHour: string; lastHour: string }[] = []
    
    if (selectedDates && selectedDates.length > 0) {
      // Fetch messages for specific dates
      const allMessages: typeof messages = []
      
      console.log(`[SUMMARIZE] 📅 Fetching ${selectedDates.length} day(s): ${selectedDates.join(', ')}`)
      
      for (const date of selectedDates) {
        const startOfDay = `${date}T00:00:00.000Z`
        const endOfDay = `${date}T23:59:59.999Z`
        
        // Paginate to get all messages for this day (Supabase limits to 1000 per request)
        const dayMessages: typeof messages = []
        const pageSize = 1000
        let offset = 0
        let hasMore = true
        
        while (hasMore) {
          const { data: pageMessages, error: pageError } = await supabase
            .from('tv_chat_messages')
            .select('username, text, time, is_moderator, user_pic')
            .gte('time', startOfDay)
            .lte('time', endOfDay)
            .order('time', { ascending: true })
            .range(offset, offset + pageSize - 1)
          
          if (pageError) {
            throw new Error(`Database error for date ${date}: ${pageError.message}`)
          }
          
          if (!pageMessages || pageMessages.length === 0) {
            hasMore = false
          } else {
            dayMessages.push(...pageMessages)
            offset += pageSize
            hasMore = pageMessages.length === pageSize
          }
        }
        
        if (dayMessages.length > 0) {
          allMessages.push(...dayMessages)
          
          // Log per-day stats with first and last message hours
          const firstMsg = dayMessages[0]
          const lastMsg = dayMessages[dayMessages.length - 1]
          const firstHour = new Date(firstMsg.time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
          const lastHour = new Date(lastMsg.time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
          
          dayStats.push({ date, count: dayMessages.length, firstHour, lastHour })
          console.log(`[SUMMARIZE]   📆 ${date}: ${dayMessages.length} msgs (${firstHour} - ${lastHour})`)
        } else {
          console.log(`[SUMMARIZE]   📆 ${date}: 0 msgs`)
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
        .select('username, text, time, is_moderator, user_pic')
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
        month: '2-digit',
        timeZone: 'Europe/Berlin'
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
    
    // Determine the cache date (use first selected date or today)
    const cacheDate = selectedDates && selectedDates.length > 0 
      ? selectedDates[0] 
      : today
    
    // Use the requested dayRange for caching (1, 3, or 7)
    // This ensures consistent cache keys even if fewer dates are available
    const effectiveDayRange = dayRange || (selectedDates ? selectedDates.length : 1)
    
    // Log summary of what we're sending to the model
    const isMultiDay = effectiveDayRange > 1
    const nowStr = new Date().toLocaleString('de-DE', { 
      day: '2-digit', month: 'short', year: 'numeric', 
      hour: '2-digit', minute: '2-digit', 
      timeZone: 'Europe/Berlin' 
    })
    console.log(`[SUMMARIZE] ════════════════════════════════════════════`)
    console.log(`[SUMMARIZE] 🤖 Sending to model:`)
    console.log(`[SUMMARIZE]    🕐 Current time: ${nowStr}`)
    console.log(`[SUMMARIZE]    Mode: ${effectiveDayRange}-day summary (${selectedDates?.length || 1} days of data)`)
    console.log(`[SUMMARIZE]    📅 FIRST message: ${messages[0]?.time || 'N/A'}`)
    console.log(`[SUMMARIZE]       Content: "${messages[0]?.text?.slice(0, 100) || 'N/A'}${(messages[0]?.text?.length || 0) > 100 ? '...' : ''}"`)
    console.log(`[SUMMARIZE]       User: ${messages[0]?.username || 'N/A'}`)
    console.log(`[SUMMARIZE]    📅 LAST message:  ${messages[messages.length - 1]?.time || 'N/A'}`)
    console.log(`[SUMMARIZE]       Content: "${messages[messages.length - 1]?.text?.slice(0, 100) || 'N/A'}${(messages[messages.length - 1]?.text?.length || 0) > 100 ? '...' : ''}"`)
    console.log(`[SUMMARIZE]       User: ${messages[messages.length - 1]?.username || 'N/A'}`)
    console.log(`[SUMMARIZE]    Total messages: ${messages.length}`)
    console.log(`[SUMMARIZE]    Unique users: ${uniqueUsers}`)
    if (dayStats.length > 0) {
      console.log(`[SUMMARIZE]    Date range: ${dateRangeStr}`)
      dayStats.forEach(ds => {
        console.log(`[SUMMARIZE]      • ${ds.date}: ${ds.count} msgs (first: ${ds.firstHour}, last: ${ds.lastHour})`)
      })
    }
    console.log(`[SUMMARIZE] ════════════════════════════════════════════`)
    
    // Build username -> avatar map and message counts from messages
    const userAvatarMap = new Map<string, string>()
    const userMessageCounts = new Map<string, number>()
    for (const msg of messages) {
      if (msg.user_pic && !userAvatarMap.has(msg.username)) {
        userAvatarMap.set(msg.username, msg.user_pic)
      }
      userMessageCounts.set(msg.username, (userMessageCounts.get(msg.username) || 0) + 1)
    }
    
    // Build active chatters list (sorted by message count, top 10)
    const activeChatters = Array.from(userMessageCounts.entries())
      .map(([username, messageCount]) => ({
        username,
        avatar: userAvatarMap.get(username),
        messageCount
      }))
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 10)
    
    // Stream AI response using GPT-5.1
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
      onFinish: async ({ object, error: finishError }) => {
        if (object) {
          // Enrich topContributors with avatars and add activeChatters
          const enrichedData = {
            ...object,
            topContributors: (object as UnifiedNewspaperData).topContributors.map(contributor => ({
              ...contributor,
              avatar: userAvatarMap.get(contributor.username) || undefined
            })),
            activeChatters
          } as UnifiedNewspaperData
          
          await saveToCache(cacheDate, effectiveDayRange, enrichedData, messages.length, uniqueUsers)
        } else if (finishError) {
          console.error(`[SUMMARIZE] ❌ Schema error:`, String(finishError))
        }
      },
      onError: (error) => {
        console.error('[SUMMARIZE] ❌ Stream error:', error)
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

