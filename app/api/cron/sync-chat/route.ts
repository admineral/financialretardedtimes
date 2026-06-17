/**
 * ============================================================================
 * TradingView Chat Sync Cron Job
 * ============================================================================
 * 
 * This endpoint syncs chat messages from TradingView to our Supabase database.
 * It runs every 5 minutes via Vercel Cron (configured in vercel.json).
 * 
 * ## How It Works
 * 
 * 1. **Initial Fetch** (first run): Fetches ALL available messages from 
 *    TradingView (up to ~1000 messages / 7 days of history).
 * 
 * 2. **Smart Sync** (subsequent runs): Only fetches NEW messages until it
 *    finds overlap with existing messages in the database. Stops when:
 *    - A page has 0 new messages (fully caught up)
 *    - A page has ≥80% existing messages (mostly caught up)
 *    - Empty or partial page (end of TradingView history)
 * 
 * ## TradingView API Details
 * 
 * - Endpoint: GET /conversation-status/?room_id=XXX&offset=N
 * - Returns: 30 messages per request (newest first)
 * - Pagination: offset=0 (newest), offset=30 (older), offset=60 (even older)
 * - History limit: ~1000 messages / ~7 days (older messages are purged)
 * 
 * ## Data Preservation
 * 
 * - Messages are NEVER deleted from our database
 * - We use upsert (insert or update), so even if TradingView deletes a
 *   message, we keep it in our archive
 * - This creates a permanent historical record of the chat
 * 
 * ## Extracted Data
 * 
 * - Messages: username, text, time, badges, user_pic, etc.
 * - Links: URLs extracted from messages (tradingview, twitter, youtube, etc.)
 * - Quotes: [quote="user"]text[/quote] patterns extracted
 * 
 * ## Endpoints
 * 
 * - GET /api/cron/sync-chat - Run sync (requires CRON_SECRET auth)
 * - GET /api/cron/sync-chat?hard=true - Force fetch 500+ messages
 * - GET /api/cron/sync-chat?rooms=bitcoin_de_DE,ethereum_de_DE - Custom rooms
 * 
 * @see vercel.json - Cron schedule configuration
 * @see supabase/migrations - Database schema for tv_chat_* tables
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Allow up to 60 seconds for sync (Vercel Hobby limit)
// Increase to 300 for Pro plan if needed
export const maxDuration = 60

const TRADINGVIEW_ORIGIN = 'https://de.tradingview.com'

// Default rooms to sync
const DEFAULT_ROOMS = ['bitcoin_de_DE']

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  // If no secret is configured, allow in development
  if (!cronSecret) {
    console.warn('[CRON] ⚠️ No CRON_SECRET configured - allowing request (set CRON_SECRET env var for production)')
    return true
  }
  
  const isValid = authHeader === `Bearer ${cronSecret}`
  console.log(`[CRON] Auth check: ${isValid ? '✅ Valid' : '❌ Invalid'} (header: ${authHeader ? 'present' : 'missing'})`)
  return isValid
}

interface ChatMessage {
  id: string
  username: string
  text: string
  time: string
  user_id?: number
  user_pic?: string
  badges?: Array<{ name: string; verbose_name: string }>
  is_moderator?: boolean
  meta?: Record<string, unknown>
  symbol?: string
}

interface ExtractedLink {
  url: string
  domain: string
  linkType: 'tradingview' | 'twitter' | 'youtube' | 'image' | 'other'
}

interface ExtractedQuote {
  quotedUsername: string
  quotedText: string
}

/**
 * Extract links from message text
 */
function extractLinks(text: string): ExtractedLink[] {
  const links: ExtractedLink[] = []
  
  // URL regex - matches http/https URLs
  const urlRegex = /https?:\/\/[^\s\[\]<>"{}|\\^`]+/gi
  const matches = text.match(urlRegex) || []
  
  for (const url of matches) {
    try {
      const urlObj = new URL(url)
      const domain = urlObj.hostname.replace('www.', '')
      
      let linkType: ExtractedLink['linkType'] = 'other'
      
      if (domain.includes('tradingview.com')) {
        linkType = 'tradingview'
      } else if (domain.includes('twitter.com') || domain.includes('x.com')) {
        linkType = 'twitter'
      } else if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
        linkType = 'youtube'
      } else if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(urlObj.pathname)) {
        linkType = 'image'
      }
      
      links.push({ url, domain, linkType })
    } catch {
      // Invalid URL, skip
    }
  }
  
  return links
}

/**
 * Extract quotes from message text
 * Format: [quote="username"]quoted text[/quote]
 */
function extractQuotes(text: string): ExtractedQuote[] {
  const quotes: ExtractedQuote[] = []
  
  // Match [quote="username"]content[/quote]
  const quoteRegex = /\[quote="([^"]+)"\]([\s\S]*?)\[\/quote\]/gi
  let match
  
  while ((match = quoteRegex.exec(text)) !== null) {
    const quotedUsername = match[1]
    const quotedText = match[2].trim().substring(0, 500) // Limit quoted text length
    
    quotes.push({ quotedUsername, quotedText })
  }
  
  return quotes
}

/**
 * Fetch messages from TradingView with offset
 */
async function fetchMessages(roomId: string, offset: number = 0): Promise<ChatMessage[]> {
  const queryString = new URLSearchParams({
    _rand: Math.random().toString(),
    offset: offset.toString(),
    room_id: roomId,
    stat_interval: '',
    stat_symbol: '',
    is_private: '',
    _: Date.now().toString()
  }).toString()
  
  const httpUrl = `${TRADINGVIEW_ORIGIN}/conversation-status/?${queryString}`
  
  const response = await fetch(httpUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Referer': TRADINGVIEW_ORIGIN,
      'Cache-Control': 'no-cache'
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  const data = await response.json()
  return data.messages || []
}

/**
 * Fetch ALL messages from TradingView (for initial full fetch)
 */
async function fetchAllMessages(roomId: string): Promise<ChatMessage[]> {
  console.log('[CRON] 📚 Starting INITIAL FULL FETCH for room:', roomId)
  const allMessages: ChatMessage[] = []
  const seenIds = new Set<string>()
  let offset = 0
  const batchSize = 30 // TradingView API returns 30 messages per request
  const maxIterations = 100 // Increased to compensate for smaller batch size
  let iterations = 0
  let emptyBatchCount = 0
  
  while (iterations < maxIterations && emptyBatchCount < 3) {
    iterations++
    
    const messages = await fetchMessages(roomId, offset)
    
    if (messages.length === 0) {
      emptyBatchCount++
      console.log(`[CRON] 📚 Empty batch at offset ${offset} (${emptyBatchCount}/3)`)
    } else {
      emptyBatchCount = 0
      
      // Deduplicate
      let newCount = 0
      for (const msg of messages) {
        const msgId = msg.id || `${msg.username}-${msg.time}`
        if (!seenIds.has(msgId)) {
          seenIds.add(msgId)
          allMessages.push(msg)
          newCount++
        }
      }
      
      console.log(`[CRON] 📚 Batch ${iterations}: offset=${offset}, fetched=${messages.length}, new=${newCount}, total=${allMessages.length}`)
      
      if (newCount === 0 || messages.length < batchSize) {
        console.log('[CRON] 📚 Reached end of messages')
        break
      }
    }
    
    offset += batchSize
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  console.log(`[CRON] 📚 INITIAL FULL FETCH complete: ${allMessages.length} total messages`)
  return allMessages
}

/**
 * SMART SYNC: Fetch messages until we hit ones we already have in DB
 * This is more efficient than fetching all 100 messages every time
 * It scrolls back through chat history until it finds existing messages
 */
async function smartFetchUntilExisting(
  roomId: string, 
  existingIds: Set<string>,
  newestExistingTime: Date | null
): Promise<{ messages: ChatMessage[], stoppedEarly: boolean }> {
  console.log('[CRON] 🧠 Starting SMART SYNC for room:', roomId)
  console.log(`[CRON] 🧠 Existing IDs in DB: ${existingIds.size}`)
  console.log(`[CRON] 🧠 Newest existing time: ${newestExistingTime?.toISOString() || 'N/A'}`)
  
  const allMessages: ChatMessage[] = []
  const seenIds = new Set<string>()
  let offset = 0
  const batchSize = 30 // TradingView API returns 30 messages per request
  const maxIterations = 50 // Safety limit
  let iterations = 0
  
  while (iterations < maxIterations) {
    iterations++
    
    const messages = await fetchMessages(roomId, offset)
    
    if (messages.length === 0) {
      console.log(`[CRON] 🧠 Empty batch at offset ${offset} - reached end`)
      break
    }
    
    let newInBatch = 0
    let existingInBatch = 0
    
    for (const msg of messages) {
      const msgId = msg.id || `${msg.username}-${msg.time}`
      
      // Skip if we've seen this in current fetch
      if (seenIds.has(msgId)) continue
      seenIds.add(msgId)
      
      // Check if message already exists in DB
      if (existingIds.has(msgId)) {
        existingInBatch++
      } else {
        newInBatch++
        allMessages.push(msg)
      }
    }
    
    console.log(`[CRON] 🧠 Batch ${iterations}: offset=${offset}, fetched=${messages.length}, new=${newInBatch}, existing=${existingInBatch}`)
    
    // Stop conditions:
    // 1. If page has NO new messages → we're caught up
    // 2. If page has >80% existing → we're mostly caught up, stop
    // 3. Otherwise keep going (we're still finding new messages)
    
    if (newInBatch === 0) {
      console.log(`[CRON] 🧠 No new messages in batch - caught up, stopping`)
      return { messages: allMessages, stoppedEarly: true }
    }
    
    if (existingInBatch > 0) {
      const existingPercent = Math.round((existingInBatch / messages.length) * 100)
      console.log(`[CRON] 🧠 Overlap: ${existingPercent}% existing, ${newInBatch} new collected`)
      
      // If >80% existing, we've mostly caught up - stop
      // (allows for small edge cases but doesn't over-fetch)
      if (existingPercent >= 80) {
        console.log(`[CRON] 🧠 ${existingPercent}% existing - caught up, stopping`)
        return { messages: allMessages, stoppedEarly: true }
      }
      // Otherwise: keep going, we're still finding significant new messages
    }
    
    // If batch is not full, we've reached the end of chat history
    if (messages.length < batchSize) {
      console.log(`[CRON] 🧠 Partial batch (${messages.length}/${batchSize}) - reached end of history`)
      break
    }
    
    offset += batchSize
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  
  console.log(`[CRON] 🧠 SMART SYNC complete: ${allMessages.length} new messages found`)
  return { messages: allMessages, stoppedEarly: false }
}

/**
 * Cron endpoint for syncing chat messages
 * Called every 5 minutes by Vercel cron
 * 
 * Logic:
 * - First time: Do initial full fetch (all messages)
 * - After that: Only fetch latest 100 messages
 */
export async function GET(request: NextRequest) {
  const startTime = new Date()
  console.log('═══════════════════════════════════════════════════════════')
  console.log('🔄 [CRON] Chat sync started at:', startTime.toISOString())
  console.log('═══════════════════════════════════════════════════════════')
  
  // Determine trigger type from query param or header
  const { searchParams } = new URL(request.url)
  const triggerType = searchParams.get('trigger') || 'cron'
  
  // Verify authorization
  if (!verifyCronSecret(request)) {
    console.error('[CRON] Unauthorized request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const results: Array<{
    roomId: string
    success: boolean
    synced: number
    fetched: number
    duplicates: number
    linksExtracted: number
    quotesExtracted: number
    isInitialFetch: boolean
    latestMessageTime?: string
    oldestMessageTime?: string
    error?: string
    historyId?: number
  }> = []
  
  try {
    const supabase = await createClient()
    
    // Get rooms to sync (from query param or defaults)
    const roomsParam = searchParams.get('rooms')
    const rooms = roomsParam ? roomsParam.split(',') : DEFAULT_ROOMS
    
    for (const roomId of rooms) {
      console.log('───────────────────────────────────────────────────────────')
      console.log(`[CRON] 🏠 Processing room: ${roomId}`)
      console.log('───────────────────────────────────────────────────────────')
      
      // Create sync history record at start
      const { data: historyRecord } = await supabase
        .from('tv_sync_history')
        .insert({
          room_id: roomId,
          started_at: startTime.toISOString(),
          trigger_type: triggerType,
          success: false,
          messages_fetched: 0,
          messages_inserted: 0,
          duplicates_skipped: 0
        })
        .select('id')
        .single()
      
      const historyId = historyRecord?.id
      
      try {
        // Check sync status - do we need initial fetch?
        const { data: syncStatus } = await supabase
          .from('tv_chat_sync_status')
          .select('*')
          .eq('room_id', roomId)
          .single()
        
        const needsInitialFetch = !syncStatus?.is_full_history
        
        console.log(`[CRON] 📊 Sync status:`)
        console.log(`[CRON]    - is_full_history: ${syncStatus?.is_full_history || false}`)
        console.log(`[CRON]    - total_messages: ${syncStatus?.total_messages || 0}`)
        console.log(`[CRON]    - newest_message_time: ${syncStatus?.newest_message_time || 'N/A'}`)
        console.log(`[CRON]    - last_sync_at: ${syncStatus?.last_sync_at || 'Never'}`)
        console.log(`[CRON]    - needs_initial_fetch: ${needsInitialFetch}`)
        
        let messages: ChatMessage[]
        
        // Check if this is a hard refresh (skip smart sync)
        const hardRefresh = searchParams.get('hard') === 'true'
        
        if (needsInitialFetch) {
          // Do initial full fetch
          console.log('[CRON] 🚀 Performing INITIAL FULL FETCH...')
          messages = await fetchAllMessages(roomId)
        } else if (hardRefresh) {
          // Hard refresh - fetch more aggressively
          console.log('[CRON] 💪 HARD REFRESH - fetching up to 500 messages...')
          messages = []
          const seenIds = new Set<string>()
          for (let offset = 0; offset < 510; offset += 30) { // 17 pages * 30 = 510 messages max
            const batch = await fetchMessages(roomId, offset)
            if (batch.length === 0) break
            for (const msg of batch) {
              const msgId = msg.id || `${msg.username}-${msg.time}`
              if (!seenIds.has(msgId)) {
                seenIds.add(msgId)
                messages.push(msg)
              }
            }
            if (batch.length < 30) break // TradingView returns 30 per page
            await new Promise(resolve => setTimeout(resolve, 50))
          }
        } else {
          // SMART SYNC: Only fetch until we hit existing messages
          console.log('[CRON] 🧠 Using SMART SYNC...')
          
          // Get existing message IDs from DB (last 24 hours for efficiency)
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
          const { data: recentMessages } = await supabase
            .from('tv_chat_messages')
            .select('id, time')
            .eq('room_id', roomId)
            .gte('time', oneDayAgo)
            .order('time', { ascending: false })
            .limit(1000)
          
          const existingIds = new Set((recentMessages || []).map(m => m.id))
          const newestTime = recentMessages?.[0]?.time ? new Date(recentMessages[0].time) : null
          
          const result = await smartFetchUntilExisting(roomId, existingIds, newestTime)
          messages = result.messages
          
          console.log(`[CRON] 🧠 Smart sync result: ${messages.length} new messages, stopped early: ${result.stoppedEarly}`)
        }
        
        console.log(`[CRON] 📥 Fetched ${messages.length} messages from TradingView`)
        
        if (messages.length > 0) {
          // Log time range of fetched messages
          const times = messages.map(m => new Date(m.time).getTime())
          const newestTime = new Date(Math.max(...times))
          const oldestTime = new Date(Math.min(...times))
          
          console.log(`[CRON] ⏰ Message time range:`)
          console.log(`[CRON]    - Newest: ${newestTime.toISOString()}`)
          console.log(`[CRON]    - Oldest: ${oldestTime.toISOString()}`)
          
          // Log sample messages
          console.log(`[CRON] 📝 Sample messages (first 3):`)
          messages.slice(0, 3).forEach((m, i) => {
            console.log(`[CRON]    ${i + 1}. [${m.time}] ${m.username}: ${m.text.substring(0, 60)}${m.text.length > 60 ? '...' : ''}`)
          })
        }
        
        if (messages.length === 0) {
          console.log(`[CRON] ℹ️ No messages returned from TradingView API`)
          
          if (historyId) {
            await supabase
              .from('tv_sync_history')
              .update({
                completed_at: new Date().toISOString(),
                success: true,
                messages_fetched: 0,
                messages_inserted: 0,
                duplicates_skipped: 0
              })
              .eq('id', historyId)
          }
          
          results.push({
            roomId,
            success: true,
            synced: 0,
            fetched: 0,
            duplicates: 0,
            linksExtracted: 0,
            quotesExtracted: 0,
            isInitialFetch: needsInitialFetch,
            historyId
          })
          continue
        }
        
        // Check for existing messages to avoid duplicates
        const messageIds = messages.map(m => m.id || `${m.username}-${m.time}`)
        
        const { data: existingMessages } = await supabase
          .from('tv_chat_messages')
          .select('id')
          .eq('room_id', roomId)
          .in('id', messageIds)
        
        const existingIds = new Set((existingMessages || []).map(m => m.id))
        const duplicatesCount = existingIds.size
        
        // Filter to only new messages
        const newMessages = messages.filter(m => {
          const msgId = m.id || `${m.username}-${m.time}`
          return !existingIds.has(msgId)
        })
        
        console.log(`[CRON] 📊 Deduplication:`)
        console.log(`[CRON]    - Total fetched: ${messages.length}`)
        console.log(`[CRON]    - Already in DB: ${duplicatesCount}`)
        console.log(`[CRON]    - New to insert: ${newMessages.length}`)
        
        let insertedCount = 0
        let linksExtracted = 0
        let quotesExtracted = 0
        
        if (newMessages.length > 0) {
          console.log(`[CRON] 💾 Inserting ${newMessages.length} new messages...`)
          
          // Insert messages
          const dbMessages = newMessages.map(msg => ({
            id: msg.id || `${msg.username}-${msg.time}`,
            room_id: roomId,
            username: msg.username,
            user_id: msg.user_id || null,
            text: msg.text,
            time: msg.time,
            user_pic: msg.user_pic || null,
            badges: msg.badges || null,
            is_moderator: msg.is_moderator || false,
            meta: msg.meta || null,
            symbol: msg.symbol || null
          }))
          
          const { error: insertError, data: insertedData } = await supabase
            .from('tv_chat_messages')
            .upsert(dbMessages, {
              onConflict: 'room_id,id',
              ignoreDuplicates: false
            })
            .select('id')
          
          if (insertError) {
            console.error(`[CRON] ❌ Insert error:`, insertError)
            throw insertError
          }
          
          insertedCount = insertedData?.length || newMessages.length
          console.log(`[CRON] ✅ Inserted ${insertedCount} messages`)
          
          // Extract and store links
          const allLinks: Array<{
            room_id: string
            message_id: string
            username: string
            url: string
            domain: string
            link_type: string
            message_time: string
          }> = []
          
          for (const msg of newMessages) {
            const links = extractLinks(msg.text)
            for (const link of links) {
              allLinks.push({
                room_id: roomId,
                message_id: msg.id || `${msg.username}-${msg.time}`,
                username: msg.username,
                url: link.url,
                domain: link.domain,
                link_type: link.linkType,
                message_time: msg.time
              })
            }
          }
          
          if (allLinks.length > 0) {
            console.log(`[CRON] 🔗 Extracting ${allLinks.length} links...`)
            
            const { error: linksError } = await supabase
              .from('tv_chat_links')
              .upsert(allLinks, {
                onConflict: 'room_id,message_id,url',
                ignoreDuplicates: true
              })
            
            if (linksError) {
              console.warn(`[CRON] ⚠️ Links insert warning:`, linksError.message)
            } else {
              linksExtracted = allLinks.length
              console.log(`[CRON] ✅ Stored ${linksExtracted} links`)
              
              // Log sample links
              allLinks.slice(0, 3).forEach((l, i) => {
                console.log(`[CRON]    ${i + 1}. [${l.link_type}] ${l.username}: ${l.url.substring(0, 60)}...`)
              })
            }
          }
          
          // Extract and store quotes
          const allQuotes: Array<{
            room_id: string
            message_id: string
            quoter_username: string
            quoted_username: string
            quoted_text: string
            message_time: string
          }> = []
          
          for (const msg of newMessages) {
            const quotes = extractQuotes(msg.text)
            for (const quote of quotes) {
              allQuotes.push({
                room_id: roomId,
                message_id: msg.id || `${msg.username}-${msg.time}`,
                quoter_username: msg.username,
                quoted_username: quote.quotedUsername,
                quoted_text: quote.quotedText,
                message_time: msg.time
              })
            }
          }
          
          if (allQuotes.length > 0) {
            console.log(`[CRON] 💬 Extracting ${allQuotes.length} quotes...`)
            
            const { error: quotesError } = await supabase
              .from('tv_chat_quotes')
              .upsert(allQuotes, {
                onConflict: 'room_id,message_id,quoted_username',
                ignoreDuplicates: true
              })
            
            if (quotesError) {
              console.warn(`[CRON] ⚠️ Quotes insert warning:`, quotesError.message)
            } else {
              quotesExtracted = allQuotes.length
              console.log(`[CRON] ✅ Stored ${quotesExtracted} quotes`)
              
              // Log sample quotes
              allQuotes.slice(0, 3).forEach((q, i) => {
                console.log(`[CRON]    ${i + 1}. ${q.quoter_username} quoted ${q.quoted_username}: "${q.quoted_text.substring(0, 40)}..."`)
              })
            }
          }
          
          // Update sync status
          const times = messages.map(m => new Date(m.time).getTime())
          const newestTime = new Date(Math.max(...times))
          const oldestTime = new Date(Math.min(...times))
          
          // Get total count
          const { count } = await supabase
            .from('tv_chat_messages')
            .select('*', { count: 'exact', head: true })
            .eq('room_id', roomId)
          
          console.log(`[CRON] 📈 Database stats:`)
          console.log(`[CRON]    - Total messages in DB: ${count}`)
          console.log(`[CRON]    - Newest message: ${newestTime.toISOString()}`)
          
          await supabase
            .from('tv_chat_sync_status')
            .upsert({
              room_id: roomId,
              last_sync_at: new Date().toISOString(),
              newest_message_time: newestTime.toISOString(),
              oldest_message_time: needsInitialFetch ? oldestTime.toISOString() : (syncStatus?.oldest_message_time || oldestTime.toISOString()),
              total_messages: count || 0,
              is_full_history: true,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'room_id'
            })
          
          // Log new messages
          console.log(`[CRON] 📝 New messages inserted:`)
          newMessages.slice(0, 5).forEach((m, i) => {
            console.log(`[CRON]    ${i + 1}. [${m.time}] ${m.username}: ${m.text.substring(0, 50)}...`)
          })
          if (newMessages.length > 5) {
            console.log(`[CRON]    ... and ${newMessages.length - 5} more`)
          }
        } else {
          console.log(`[CRON] ℹ️ All ${messages.length} messages already exist - no insert needed`)
        }
        
        // Update sync history with success
        if (historyId) {
          await supabase
            .from('tv_sync_history')
            .update({
              completed_at: new Date().toISOString(),
              success: true,
              messages_fetched: messages.length,
              messages_inserted: insertedCount,
              duplicates_skipped: duplicatesCount
            })
            .eq('id', historyId)
        }
        
        const times = messages.map(m => new Date(m.time).getTime())
        
        results.push({
          roomId,
          success: true,
          synced: insertedCount,
          fetched: messages.length,
          duplicates: duplicatesCount,
          linksExtracted,
          quotesExtracted,
          isInitialFetch: needsInitialFetch,
          latestMessageTime: messages.length > 0 ? new Date(Math.max(...times)).toISOString() : undefined,
          oldestMessageTime: messages.length > 0 ? new Date(Math.min(...times)).toISOString() : undefined,
          historyId
        })
        
      } catch (roomError) {
        console.error(`[CRON] ❌ Error syncing room ${roomId}:`, roomError)
        const errorMsg = roomError instanceof Error ? roomError.message : 'Unknown error'
        
        if (historyId) {
          await supabase
            .from('tv_sync_history')
            .update({
              completed_at: new Date().toISOString(),
              success: false,
              error_message: errorMsg
            })
            .eq('id', historyId)
        }
        
        results.push({
          roomId,
          success: false,
          synced: 0,
          fetched: 0,
          duplicates: 0,
          linksExtracted: 0,
          quotesExtracted: 0,
          isInitialFetch: false,
          error: errorMsg,
          historyId
        })
      }
    }
    
    const endTime = new Date()
    const duration = endTime.getTime() - startTime.getTime()
    
    const totalSynced = results.reduce((sum, r) => sum + r.synced, 0)
    const totalFetched = results.reduce((sum, r) => sum + r.fetched, 0)
    const totalLinks = results.reduce((sum, r) => sum + r.linksExtracted, 0)
    const totalQuotes = results.reduce((sum, r) => sum + r.quotesExtracted, 0)
    const allSuccess = results.every(r => r.success)
    
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`[CRON] ✅ Sync complete in ${duration}ms`)
    console.log(`[CRON] 📊 Summary:`)
    console.log(`[CRON]    - Messages fetched: ${totalFetched}`)
    console.log(`[CRON]    - Messages inserted: ${totalSynced}`)
    console.log(`[CRON]    - Links extracted: ${totalLinks}`)
    console.log(`[CRON]    - Quotes extracted: ${totalQuotes}`)
    console.log('═══════════════════════════════════════════════════════════')
    
    return NextResponse.json({
      success: allSuccess,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      totalSynced,
      totalFetched,
      totalLinks,
      totalQuotes,
      results
    })
    
  } catch (error) {
    console.error('[CRON] ❌ Fatal error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        results
      },
      { status: 500 }
    )
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request)
}
