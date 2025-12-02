import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { getSchemaForPrompt, PROMPT_VERSIONS } from '../../summarize-v6/schemas'

// BTC Context Interface
interface BTCContext {
  currentPrice: number          // Aktueller Preis in USD
  priceEUR: number              // Aktueller Preis in EUR
  change24h: number             // % Änderung 24h
  high24h: number               // 24h Hoch
  low24h: number                // 24h Tief
  volume24h: number             // Handelsvolumen 24h in USD
  change7d: number              // % Änderung 7 Tage
  change30d: number             // % Änderung 30 Tage
  athPrice: number              // All-Time High
  athDate: string               // ATH Datum
  lastUpdated: string           // Letztes Update
}

// Fetch BTC data from CoinGecko API
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

// Format BTC context for prompt
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
    // Fetch BTC data in parallel with request parsing
    const btcPromise = fetchBTCContext()
    
    const body = await request.json()
    const { 
      messageLimit, // undefined means "use all messages"
      promptId = 'chat-reporter',
      customPrompt,
      selectedDates // Optional: Array of YYYY-MM-DD format dates
    }: { 
      messageLimit?: number
      promptId?: string
      customPrompt?: string
      selectedDates?: string[] 
    } = body
    
    const supabase = await createClient()
    
    let messages: { username: string; text: string; time: string; is_moderator: boolean }[] = []
    
    if (selectedDates && selectedDates.length > 0) {
      // Fetch ALL messages for each selected date (no limit when dates are selected)
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
      
      // Sort all messages by time (NO limit when specific dates are selected)
      messages = allMessages.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    } else {
      // Fetch all messages (no date filter)
      let query = supabase
        .from('tv_chat_messages')
        .select('username, text, time, is_moderator')
        .order('time', { ascending: true })
      
      // Only apply limit if messageLimit is provided
      if (messageLimit) {
        query = query.limit(messageLimit)
      }
      
      const { data: allMessages, error } = await query
      
      if (error) {
        throw new Error(`Database error: ${error.message}`)
      }
      
      messages = allMessages || []
    }
    
    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No messages found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
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
    
    // Get the prompt - either custom or from versions
    let systemPrompt: string
    if (customPrompt) {
      systemPrompt = customPrompt
    } else {
      const promptVersion = PROMPT_VERSIONS.find(p => p.id === promptId)
      if (!promptVersion) {
        return new Response(
          JSON.stringify({ error: `Unknown prompt version: ${promptId}` }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }
      systemPrompt = promptVersion.systemPrompt
    }
    
    // Enhanced logging
    const mode = !selectedDates || selectedDates.length === 0 
      ? 'ALL' 
      : selectedDates.length === 1 
        ? 'DAY' 
        : 'MULTI-DAY'
    
    // Calculate unique users
    const uniqueUsers = new Set(messages.map(m => m.username)).size
    
    // Calculate date range for stats
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
    
    console.log(`[SUMMARIZE V6 API] ═══════════════════════════════════════`)
    console.log(`[SUMMARIZE V6 API] 📊 Request Summary:`)
    console.log(`[SUMMARIZE V6 API]   Mode: ${mode}`)
    console.log(`[SUMMARIZE V6 API]   Dates: ${!selectedDates || selectedDates.length === 0 ? 'All dates' : selectedDates.join(', ')}`)
    console.log(`[SUMMARIZE V6 API]   ────────────────────────────────────`)
    console.log(`[SUMMARIZE V6 API]   📨 Messages Sent: ${messages.length}`)
    console.log(`[SUMMARIZE V6 API]   👥 Unique Users: ${uniqueUsers}`)
    console.log(`[SUMMARIZE V6 API]   📅 Date Span: ${dateRangeStr}`)
    if (selectedDates && selectedDates.length > 0) {
      console.log(`[SUMMARIZE V6 API]   🎚️  Limit: none (all messages from selected dates)`)
    } else if (messageLimit) {
      console.log(`[SUMMARIZE V6 API]   🎚️  Limit: ${messageLimit} (dropdown selection)`)
    } else {
      console.log(`[SUMMARIZE V6 API]   🎚️  Limit: none (all messages, ≤1000 total)`)
    }
    console.log(`[SUMMARIZE V6 API]   ────────────────────────────────────`)
    console.log(`[SUMMARIZE V6 API]   🤖 Prompt: ${promptId}${customPrompt ? ' (custom)' : ''}`)
    if (messages.length > 0) {
      const firstMsgTime = new Date(messages[0].time).toLocaleString('de-DE')
      const lastMsgTime = new Date(messages[messages.length - 1].time).toLocaleString('de-DE')
      console.log(`[SUMMARIZE V6 API]   ⏰ Time Range: ${firstMsgTime} → ${lastMsgTime}`)
    }
    if (btcContext) {
      console.log(`[SUMMARIZE V6 API]   ────────────────────────────────────`)
      console.log(`[SUMMARIZE V6 API]   💰 BTC Price: $${btcContext.currentPrice.toLocaleString()} (${btcContext.change24h >= 0 ? '+' : ''}${btcContext.change24h}% 24h)`)
      console.log(`[SUMMARIZE V6 API]   📈 7d: ${btcContext.change7d >= 0 ? '+' : ''}${btcContext.change7d}% | 30d: ${btcContext.change30d >= 0 ? '+' : ''}${btcContext.change30d}%`)
    } else {
      console.log(`[SUMMARIZE V6 API]   ⚠️  BTC Data: Not available`)
    }
    console.log(`[SUMMARIZE V6 API] ═══════════════════════════════════════`)
    
    // Get the correct schema for this editor
    const schema = getSchemaForPrompt(promptId)
    
    const result = streamObject({
      model: openai('gpt-4.1-nano'),
      schema: schema,
      system: systemPrompt,
      prompt: `Analysiere den folgenden Chat und erstelle NUR die für dich relevanten Inhalte.

Heutiges Datum: ${today}
${btcContextStr}
Chat-Protokoll (${messages.length} Nachrichten):

${formattedChat}`,
      onError: (error) => {
        console.error('[SUMMARIZE V6 API] Stream error:', error)
      }
    })
    
    return result.toTextStreamResponse()
    
  } catch (error) {
    console.error('[SUMMARIZE V6 API] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

