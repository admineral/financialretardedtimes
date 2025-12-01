import { NextRequest } from 'next/server'
import { ChatMessage } from '../../types'

// Server-Sent Events endpoint as WebSocket fallback
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const roomId = searchParams.get('roomId') || 'bitcoin_de_DE'
  const pollingInterval = parseInt(searchParams.get('pollingInterval') || '3000')
  const enablePolling = searchParams.get('enablePolling') !== 'false'
  
  console.log('🔧 [SSE] Configuration:', { roomId, pollingInterval, enablePolling })

  // Create a readable stream for Server-Sent Events
  const stream = new ReadableStream({
    start(controller) {
      // Track sent messages to avoid duplicates and detect new ones
      let sentMessageIds = new Set<string>()
      let lastMessageTime = new Date(0) // Start from epoch
      let currentPollingInterval = pollingInterval
      let consecutiveEmptyPolls = 0
      let isClosed = false // Track if the stream is closed
      
      // Helper to safely enqueue data
      const safeEnqueue = (data: string) => {
        if (isClosed) {
          console.log('⚠️ [SSE] Stream closed, skipping enqueue')
          return false
        }
        try {
          controller.enqueue(new TextEncoder().encode(data))
          return true
        } catch (error) {
          console.log('⚠️ [SSE] Failed to enqueue, stream likely closed')
          isClosed = true
          return false
        }
      }
      
      // Send initial connection message
      const data = `data: ${JSON.stringify({
        type: 'connection',
        status: 'connected',
        roomId,
        timestamp: new Date().toISOString()
      })}\n\n`
      
      safeEnqueue(data)

      // Configurable polling for chat updates
      let interval: NodeJS.Timeout | null = null
      
      if (enablePolling) {
        console.log(`⏰ [SSE] Starting polling every ${pollingInterval}ms`)
        
        const pollForUpdates = async () => {
          // Check if stream is closed before polling
          if (isClosed) {
            console.log('🛑 [SSE] Stream closed, stopping polling')
            if (interval) {
              clearTimeout(interval)
              interval = null
            }
            return
          }
          
          try {
            console.log('🔄 [SSE] Polling for updates, room:', roomId, 'interval:', currentPollingInterval)
            
            // Fetch latest messages from TradingView API
            const response = await fetch(`https://de.tradingview.com/conversation-status/?room_id=${roomId}&_rand=${Math.random()}`, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Referer': 'https://de.tradingview.com',
              }
            })

            // Check again after async operation
            if (isClosed) {
              console.log('🛑 [SSE] Stream closed during fetch, stopping')
              return
            }

            console.log('📊 [SSE] Poll response status:', response.status)

            if (response.ok) {
              const data = await response.json()
              const messages = data.messages || []
              console.log('💬 [SSE] Messages count:', messages.length)
              
              // Find new messages that haven't been sent yet
              const newMessages = messages.filter((message: ChatMessage) => {
                const messageTime = new Date(message.time)
                const messageId = message.id || `${message.username}-${message.time}`
                
                // Check if this is a new message (not sent before and newer than last known)
                return !sentMessageIds.has(messageId) && messageTime > lastMessageTime
              })
              
              console.log('🆕 [SSE] New messages found:', newMessages.length)
              
              // Send each new message
              for (const message of newMessages) {
                if (isClosed) break // Stop if closed during iteration
                
                const messageId = message.id || `${message.username}-${message.time}`
                const messageTime = new Date(message.time)
                
                console.log('📤 [SSE] Sending new message:', { id: messageId, username: message.username, time: message.time })
                
                const sseData = `data: ${JSON.stringify({
                  type: 'message',
                  data: message,
                  timestamp: new Date().toISOString()
                })}\n\n`
                
                if (!safeEnqueue(sseData)) break // Stop if enqueue fails
                
                // Track this message as sent
                sentMessageIds.add(messageId)
                
                // Update last message time
                if (messageTime > lastMessageTime) {
                  lastMessageTime = messageTime
                }
              }
              
              // Send deleted messages info (messages that were in our set but not in current response)
              if (!isClosed) {
                const currentMessageIds = new Set(messages.map((msg: ChatMessage) => msg.id || `${msg.username}-${msg.time}`))
                const deletedMessageIds = Array.from(sentMessageIds).filter(id => !currentMessageIds.has(id))
                
                if (deletedMessageIds.length > 0) {
                  console.log('🗑️ [SSE] Deleted messages detected:', deletedMessageIds.length)
                  
                  const deleteData = `data: ${JSON.stringify({
                    type: 'messages_deleted',
                    data: { deletedIds: deletedMessageIds },
                    timestamp: new Date().toISOString()
                  })}\n\n`
                  
                  safeEnqueue(deleteData)
                  
                  // Remove deleted messages from our tracking
                  deletedMessageIds.forEach(id => sentMessageIds.delete(id))
                }
              }
              
              // Cleanup old message IDs to prevent memory leaks (keep last 1000)
              if (sentMessageIds.size > 1000) {
                const idsArray = Array.from(sentMessageIds)
                const toKeep = idsArray.slice(-500) // Keep last 500
                sentMessageIds = new Set(toKeep)
              }
              
              // Adaptive polling: adjust interval based on activity
              if (newMessages.length > 0) {
                // Reset to fast polling when messages are found
                consecutiveEmptyPolls = 0
                currentPollingInterval = pollingInterval
              } else {
                // Slow down polling when no new messages
                consecutiveEmptyPolls++
                if (consecutiveEmptyPolls >= 3) {
                  currentPollingInterval = Math.min(currentPollingInterval * 1.5, 15000) // Max 15 seconds
                }
              }
              
            } else {
              console.error('❌ [SSE] Poll failed with status:', response.status)
            }
          } catch (error) {
            console.error('💥 [SSE] Error fetching updates:', error)
          }
          
          // Schedule next poll with current interval (only if not closed)
          if (!isClosed) {
            if (interval) {
              clearTimeout(interval)
            }
            interval = setTimeout(pollForUpdates, currentPollingInterval)
          }
        }
        
        // Start first poll
        pollForUpdates()
      } else {
        console.log('⏸️ [SSE] Polling disabled')
      }

      // Cleanup function
      request.signal.addEventListener('abort', () => {
        console.log('🔌 [SSE] Client disconnected, cleaning up')
        isClosed = true // Set flag first to stop any ongoing operations
        if (interval) {
          clearTimeout(interval)
          interval = null
        }
        try {
          controller.close()
        } catch {
          // Controller might already be closed
        }
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
