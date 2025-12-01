import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

/**
 * Fetch newest messages from TradingView
 */
async function fetchNewestMessages(roomId: string): Promise<ChatMessage[]> {
  const queryString = new URLSearchParams({
    _rand: Math.random().toString(),
    offset: '0',
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
 * Cron endpoint for syncing chat messages
 * Called every 10 minutes by Vercel cron
 */
export async function GET(request: NextRequest) {
  const startTime = new Date()
  console.log('🔄 [CRON] Chat sync started at:', startTime.toISOString())
  
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
    error?: string
    historyId?: number
  }> = []
  
  try {
    const supabase = await createClient()
    
    // Get rooms to sync (from query param or defaults)
    const roomsParam = searchParams.get('rooms')
    const rooms = roomsParam ? roomsParam.split(',') : DEFAULT_ROOMS
    
    for (const roomId of rooms) {
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
        console.log(`[CRON] Syncing room: ${roomId} (history ID: ${historyId})`)
        
        // Check sync status
        const { data: syncStatus } = await supabase
          .from('tv_chat_sync_status')
          .select('*')
          .eq('room_id', roomId)
          .single()
        
        if (!syncStatus?.is_full_history) {
          const errorMsg = 'Needs initial full fetch'
          console.log(`[CRON] Room ${roomId} needs initial full fetch - skipping cron sync`)
          
          // Update history with error
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
            error: errorMsg,
            historyId
          })
          continue
        }
        
        // Fetch newest messages
        const newMessages = await fetchNewestMessages(roomId)
        console.log(`[CRON] 📥 Fetched ${newMessages.length} messages from TradingView`)
        
        // Log sample of fetched messages
        if (newMessages.length > 0) {
          console.log(`[CRON] 📝 Sample messages:`)
          newMessages.slice(0, 3).forEach((m, i) => {
            const msgId = m.id || `${m.username}-${m.time}`
            console.log(`[CRON]   ${i + 1}. ID: ${msgId} | User: ${m.username} | Time: ${m.time}`)
            console.log(`[CRON]      Text: ${m.text.substring(0, 50)}${m.text.length > 50 ? '...' : ''}`)
          })
        }
        
        if (newMessages.length === 0) {
          console.log(`[CRON] ℹ️ No messages returned from TradingView API`)
          
          // Update history - success with 0 messages
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
            historyId
          })
          continue
        }
        
        // Get existing message IDs to check for duplicates
        const messageIds = newMessages.map(m => m.id || `${m.username}-${m.time}`)
        console.log(`[CRON] 🔍 Checking ${messageIds.length} message IDs against database...`)
        
        const { data: existingMessages, error: queryError } = await supabase
          .from('tv_chat_messages')
          .select('id')
          .eq('room_id', roomId)
          .in('id', messageIds)
        
        if (queryError) {
          console.error(`[CRON] ❌ Database query error:`, queryError)
          throw queryError
        }
        
        const existingIds = new Set((existingMessages || []).map(m => m.id))
        const duplicatesCount = existingIds.size
        console.log(`[CRON] 📊 Found ${duplicatesCount} existing messages in database`)
        
        // Filter to only truly new messages
        const trulyNewMessages = newMessages.filter(m => {
          const msgId = m.id || `${m.username}-${m.time}`
          return !existingIds.has(msgId)
        })
        
        console.log(`[CRON] ✨ ${trulyNewMessages.length} truly new messages to insert (${duplicatesCount} duplicates skipped)`)
        
        let insertedCount = 0
        
        if (trulyNewMessages.length > 0) {
          console.log(`[CRON] 💾 Inserting ${trulyNewMessages.length} new messages...`)
          
          // Log new messages being inserted
          trulyNewMessages.forEach((m, i) => {
            const msgId = m.id || `${m.username}-${m.time}`
            console.log(`[CRON]   NEW ${i + 1}. ID: ${msgId} | User: ${m.username}`)
          })
          
          // Insert new messages
          const dbMessages = trulyNewMessages.map(msg => ({
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
          
          insertedCount = insertedData?.length || trulyNewMessages.length
          console.log(`[CRON] ✅ Successfully inserted ${insertedCount} messages`)
          
          // Update sync status
          const newestTime = newMessages.reduce((max, m) => {
            const time = new Date(m.time).getTime()
            return time > max ? time : max
          }, 0)
          
          // Get total count
          const { count } = await supabase
            .from('tv_chat_messages')
            .select('*', { count: 'exact', head: true })
            .eq('room_id', roomId)
          
          console.log(`[CRON] 📈 Total messages in DB for ${roomId}: ${count}`)
          
          await supabase
            .from('tv_chat_sync_status')
            .update({
              last_sync_at: new Date().toISOString(),
              newest_message_time: new Date(newestTime).toISOString(),
              total_messages: count || 0,
              updated_at: new Date().toISOString()
            })
            .eq('room_id', roomId)
          
          console.log(`[CRON] ✅ Synced ${insertedCount} new messages for ${roomId}`)
        } else {
          console.log(`[CRON] ℹ️ All ${newMessages.length} messages already exist in database - no insert needed`)
        }
        
        // Update sync history with success
        if (historyId) {
          await supabase
            .from('tv_sync_history')
            .update({
              completed_at: new Date().toISOString(),
              success: true,
              messages_fetched: newMessages.length,
              messages_inserted: insertedCount,
              duplicates_skipped: duplicatesCount
            })
            .eq('id', historyId)
        }
        
        results.push({
          roomId,
          success: true,
          synced: insertedCount,
          fetched: newMessages.length,
          duplicates: duplicatesCount,
          historyId
        })
        
      } catch (roomError) {
        console.error(`[CRON] Error syncing room ${roomId}:`, roomError)
        const errorMsg = roomError instanceof Error ? roomError.message : 'Unknown error'
        
        // Update sync history with error
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
          error: errorMsg,
          historyId
        })
      }
    }
    
    const totalSynced = results.reduce((sum, r) => sum + r.synced, 0)
    const totalFetched = results.reduce((sum, r) => sum + r.fetched, 0)
    const allSuccess = results.every(r => r.success)
    
    console.log(`[CRON] ✅ Sync complete. Fetched: ${totalFetched}, Inserted: ${totalSynced}`)
    
    return NextResponse.json({
      success: allSuccess,
      timestamp: new Date().toISOString(),
      totalSynced,
      totalFetched,
      results
    })
    
  } catch (error) {
    console.error('[CRON] Fatal error:', error)
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

