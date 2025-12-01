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
    console.warn('[CRON] No CRON_SECRET configured - allowing request')
    return true
  }
  
  return authHeader === `Bearer ${cronSecret}`
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
 * Called every minute by Vercel cron
 */
export async function GET(request: NextRequest) {
  console.log('🔄 [CRON] Chat sync started at:', new Date().toISOString())
  
  // Verify authorization
  if (!verifyCronSecret(request)) {
    console.error('[CRON] Unauthorized request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const results: Array<{
    roomId: string
    success: boolean
    synced: number
    error?: string
  }> = []
  
  try {
    const supabase = await createClient()
    
    // Get rooms to sync (from query param or defaults)
    const { searchParams } = new URL(request.url)
    const roomsParam = searchParams.get('rooms')
    const rooms = roomsParam ? roomsParam.split(',') : DEFAULT_ROOMS
    
    for (const roomId of rooms) {
      try {
        console.log(`[CRON] Syncing room: ${roomId}`)
        
        // Check sync status
        const { data: syncStatus } = await supabase
          .from('tv_chat_sync_status')
          .select('*')
          .eq('room_id', roomId)
          .single()
        
        if (!syncStatus?.is_full_history) {
          console.log(`[CRON] Room ${roomId} needs initial full fetch - skipping cron sync`)
          results.push({
            roomId,
            success: false,
            synced: 0,
            error: 'Needs initial full fetch'
          })
          continue
        }
        
        // Fetch newest messages
        const newMessages = await fetchNewestMessages(roomId)
        console.log(`[CRON] Fetched ${newMessages.length} messages from TradingView`)
        
        if (newMessages.length === 0) {
          results.push({
            roomId,
            success: true,
            synced: 0
          })
          continue
        }
        
        // Get existing message IDs to check for duplicates
        const messageIds = newMessages.map(m => m.id || `${m.username}-${m.time}`)
        
        const { data: existingMessages } = await supabase
          .from('tv_chat_messages')
          .select('id')
          .eq('room_id', roomId)
          .in('id', messageIds)
        
        const existingIds = new Set((existingMessages || []).map(m => m.id))
        
        // Filter to only truly new messages
        const trulyNewMessages = newMessages.filter(m => {
          const msgId = m.id || `${m.username}-${m.time}`
          return !existingIds.has(msgId)
        })
        
        console.log(`[CRON] ${trulyNewMessages.length} truly new messages to insert`)
        
        if (trulyNewMessages.length > 0) {
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
          
          const { error: insertError } = await supabase
            .from('tv_chat_messages')
            .upsert(dbMessages, {
              onConflict: 'room_id,id',
              ignoreDuplicates: false
            })
          
          if (insertError) {
            throw insertError
          }
          
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
          
          await supabase
            .from('tv_chat_sync_status')
            .update({
              last_sync_at: new Date().toISOString(),
              newest_message_time: new Date(newestTime).toISOString(),
              total_messages: count || 0,
              updated_at: new Date().toISOString()
            })
            .eq('room_id', roomId)
          
          console.log(`[CRON] ✅ Synced ${trulyNewMessages.length} new messages for ${roomId}`)
        }
        
        results.push({
          roomId,
          success: true,
          synced: trulyNewMessages.length
        })
        
      } catch (roomError) {
        console.error(`[CRON] Error syncing room ${roomId}:`, roomError)
        results.push({
          roomId,
          success: false,
          synced: 0,
          error: roomError instanceof Error ? roomError.message : 'Unknown error'
        })
      }
    }
    
    const totalSynced = results.reduce((sum, r) => sum + r.synced, 0)
    const allSuccess = results.every(r => r.success)
    
    console.log(`[CRON] ✅ Sync complete. Total synced: ${totalSynced}`)
    
    return NextResponse.json({
      success: allSuccess,
      timestamp: new Date().toISOString(),
      totalSynced,
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

