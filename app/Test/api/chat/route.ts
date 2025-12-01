import { NextRequest, NextResponse } from 'next/server'
import { ChatMessage } from '../../types'
import { 
  getSyncStatus, 
  getCachedMessages, 
  cacheMessages, 
  markFullHistoryCached,
  getCachedMessageCount
} from '../../lib/db-cache'

const TRADINGVIEW_ORIGIN = 'https://de.tradingview.com'

// Enhanced CORS headers for Next.js 15
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
}

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  })
}

/**
 * Fetch messages from TradingView API
 */
async function fetchFromTradingView(roomId: string, offset: string = '0'): Promise<ChatMessage[]> {
  const queryString = new URLSearchParams({
    _rand: Math.random().toString(),
    offset: offset,
    room_id: roomId,
    stat_interval: '',
    stat_symbol: '',
    is_private: '',
    _: Date.now().toString()
  }).toString()
  
  const httpUrl = `${TRADINGVIEW_ORIGIN}/conversation-status/?${queryString}`
  console.log('📡 [CHAT API] Fetching from TradingView:', httpUrl)

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
 * Fetch ALL messages from TradingView (paginated)
 */
async function fetchAllFromTradingView(roomId: string): Promise<ChatMessage[]> {
  console.log('📚 [CHAT API] Fetching ALL messages from TradingView...')
  const allMessages: ChatMessage[] = []
  let offset = 0
  const stepSize = 100
  let emptyBatchCount = 0
  const maxEmptyBatches = 3 // Stop after 3 consecutive empty batches
  
  while (emptyBatchCount < maxEmptyBatches) {
    try {
      const messages = await fetchFromTradingView(roomId, offset.toString())
      
      if (messages.length === 0) {
        emptyBatchCount++
        console.log(`📚 [CHAT API] Empty batch at offset ${offset} (${emptyBatchCount}/${maxEmptyBatches})`)
      } else {
        emptyBatchCount = 0 // Reset counter on successful fetch
        allMessages.push(...messages)
        console.log(`📚 [CHAT API] Fetched ${messages.length} messages at offset ${offset} (Total: ${allMessages.length})`)
      }
      
      offset += stepSize
      
      // Safety limit - don't fetch more than 10000 messages in one go
      if (allMessages.length >= 10000) {
        console.log('📚 [CHAT API] Reached safety limit of 10000 messages')
        break
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (error) {
      console.error(`📚 [CHAT API] Error at offset ${offset}:`, error)
      break
    }
  }
  
  console.log(`📚 [CHAT API] Total fetched: ${allMessages.length} messages`)
  return allMessages
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const roomId = searchParams.get('roomId') || 'bitcoin_de_DE'
  const offset = searchParams.get('offset') || '0'
  const forceRefresh = searchParams.get('forceRefresh') === 'true'
  const useCache = searchParams.get('useCache') !== 'false' // Default to using cache

  console.log('🚀 [CHAT API] Request for room:', roomId, 'offset:', offset, 'useCache:', useCache, 'forceRefresh:', forceRefresh)

  try {
    // Check if we should use database cache
    if (useCache && !forceRefresh) {
      let syncStatus = null
      let dbAvailable = true
      
      try {
        syncStatus = await getSyncStatus(roomId)
        console.log('📊 [CHAT API] Sync status:', syncStatus)
      } catch (dbError) {
        console.warn('⚠️ [CHAT API] Database not available, falling back to direct fetch:', dbError)
        dbAvailable = false
      }
      
      if (dbAvailable && syncStatus?.is_full_history) {
        // We have full history cached - serve from DB
        console.log('✅ [CHAT API] Using cached data (full history available)')
        
        // Get cached messages
        const cachedMessages = await getCachedMessages(roomId)
        const cachedCount = cachedMessages.length
        
        // Check if we need to fetch newest messages (only if offset is 0)
        if (offset === '0') {
          // Fetch newest messages from TradingView
          const newMessages = await fetchFromTradingView(roomId, '0')
          
          if (newMessages.length > 0) {
            // Cache any new messages
            const existingIds = new Set(cachedMessages.map(m => m.id || `${m.username}-${m.time}`))
            const trulyNewMessages = newMessages.filter(m => {
              const msgId = m.id || `${m.username}-${m.time}`
              return !existingIds.has(msgId)
            })
            
            if (trulyNewMessages.length > 0) {
              console.log(`📥 [CHAT API] Caching ${trulyNewMessages.length} new messages`)
              await cacheMessages(roomId, trulyNewMessages)
              
              // Merge and return all messages
              const allMessages = [...cachedMessages, ...trulyNewMessages]
                .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
              
              return NextResponse.json({ 
                success: true, 
                messages: allMessages,
                meta: {
                  roomId,
                  timestamp: new Date().toISOString(),
                  count: allMessages.length,
                  source: 'cache+live',
                  cachedCount,
                  newCount: trulyNewMessages.length
                }
              }, { headers: corsHeaders })
            }
          }
        }
        
        // Return cached messages only
        return NextResponse.json({ 
          success: true, 
          messages: cachedMessages,
          meta: {
            roomId,
            timestamp: new Date().toISOString(),
            count: cachedMessages.length,
            source: 'cache',
            lastSync: syncStatus.last_sync_at
          }
        }, { headers: corsHeaders })
      }
      
      // No full history yet - need to fetch all (only if DB is available)
      if (dbAvailable) {
        console.log('📥 [CHAT API] No cached history, fetching all messages...')
        const allMessages = await fetchAllFromTradingView(roomId)
        
        if (allMessages.length > 0) {
          // Try to cache all messages
          try {
            console.log(`💾 [CHAT API] Caching ${allMessages.length} messages to database`)
            await cacheMessages(roomId, allMessages)
            await markFullHistoryCached(roomId)
          } catch (cacheError) {
            console.warn('⚠️ [CHAT API] Failed to cache messages:', cacheError)
          }
          
          // Sort and return
          const sortedMessages = allMessages.sort((a, b) => 
            new Date(a.time).getTime() - new Date(b.time).getTime()
          )
          
          return NextResponse.json({ 
            success: true, 
            messages: sortedMessages,
            meta: {
              roomId,
              timestamp: new Date().toISOString(),
              count: sortedMessages.length,
              source: 'fresh_full_fetch',
              cached: true
            }
          }, { headers: corsHeaders })
        }
      }
    }
    
    // Fallback: Direct fetch from TradingView (no caching)
    console.log('📡 [CHAT API] Direct fetch from TradingView (no cache)')
    const messages = await fetchFromTradingView(roomId, offset)
    
    return NextResponse.json({ 
      success: true, 
      messages: messages.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()),
      meta: {
        roomId,
        timestamp: new Date().toISOString(),
        count: messages.length,
        source: 'live'
      }
    }, { headers: corsHeaders })
    
  } catch (error) {
    console.error('💥 [CHAT API] Error:', error)
    
    // Try to serve from cache even on error
    try {
      const cachedMessages = await getCachedMessages(roomId)
      if (cachedMessages.length > 0) {
        console.log('🔄 [CHAT API] Serving from cache due to error')
        return NextResponse.json({ 
          success: true, 
          messages: cachedMessages,
          meta: {
            roomId,
            timestamp: new Date().toISOString(),
            count: cachedMessages.length,
            source: 'cache_fallback',
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }, { headers: corsHeaders })
      }
    } catch (cacheError) {
      console.error('💥 [CHAT API] Cache fallback also failed:', cacheError)
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch chat history', 
        messages: []
      },
      { status: 500, headers: corsHeaders }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { roomId, message } = await request.json()
    
    // This would typically require authentication and proper session handling
    // For demo purposes, we'll simulate sending a message
    console.log(`Sending message to room ${roomId}: ${message}`)
    
    return NextResponse.json({ success: true }, {
      headers: corsHeaders,
    })
  } catch (error) {
    console.error('Error sending message:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to send message' },
      { status: 500, headers: corsHeaders }
    )
  }
}

/**
 * Sync endpoint - used by cron job to keep cache fresh
 */
export async function PUT(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const roomId = searchParams.get('roomId') || 'bitcoin_de_DE'
  
  console.log('🔄 [CHAT API] Sync request for room:', roomId)
  
  try {
    const syncStatus = await getSyncStatus(roomId)
    
    if (!syncStatus?.is_full_history) {
      // Need to do initial full fetch first
      return NextResponse.json({
        success: false,
        error: 'Full history not yet cached. Call GET first.',
        needsInitialFetch: true
      }, { status: 400, headers: corsHeaders })
    }
    
    // Fetch newest messages
    const newMessages = await fetchFromTradingView(roomId, '0')
    
    if (newMessages.length === 0) {
      return NextResponse.json({
        success: true,
        synced: 0,
        message: 'No new messages'
      }, { headers: corsHeaders })
    }
    
    // Get existing message IDs to avoid duplicates
    const cachedMessages = await getCachedMessages(roomId, { limit: 200 })
    const existingIds = new Set(cachedMessages.map(m => m.id || `${m.username}-${m.time}`))
    
    const trulyNewMessages = newMessages.filter(m => {
      const msgId = m.id || `${m.username}-${m.time}`
      return !existingIds.has(msgId)
    })
    
    if (trulyNewMessages.length > 0) {
      await cacheMessages(roomId, trulyNewMessages)
      console.log(`✅ [CHAT API] Synced ${trulyNewMessages.length} new messages`)
    }
    
    const totalCount = await getCachedMessageCount(roomId)
    
    return NextResponse.json({
      success: true,
      synced: trulyNewMessages.length,
      totalCached: totalCount,
      lastSync: new Date().toISOString()
    }, { headers: corsHeaders })
    
  } catch (error) {
    console.error('💥 [CHAT API] Sync error:', error)
    return NextResponse.json(
      { success: false, error: 'Sync failed' },
      { status: 500, headers: corsHeaders }
    )
  }
}
