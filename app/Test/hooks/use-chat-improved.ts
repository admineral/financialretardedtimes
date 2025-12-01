'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChatState } from '../types'

interface ChatOptions {
  roomId?: string
  pollingEnabled?: boolean
  pollingInterval?: number
}

export function useChat(options: ChatOptions = {}) {
  const { 
    roomId = 'bitcoin_de_DE', 
    pollingEnabled = true, 
    pollingInterval = 10000 
  } = options
  const [state, setState] = useState<ChatState>({
    messages: [],
    isConnected: false,
    isLoading: true,
    error: null
  })

  const sseRef = useRef<EventSource | null>(null)
  const mountedRef = useRef(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)

  // Load initial chat history
  const loadChatHistory = useCallback(async (offset = 0, append = false) => {
    if (!mountedRef.current) return

    try {
      if (!append) {
        setState(prev => ({ ...prev, isLoading: true, error: null }))
      } else {
        setIsLoadingMore(true)
      }
      
      const response = await fetch(`/Test/api/chat?roomId=${roomId}&offset=${offset}`)
      const data = await response.json()
      
      if (!mountedRef.current) return

      if (data.success) {
        const newMessages = data.messages || []
        
        setState(prev => {
          if (append) {
            // For pagination, merge with existing messages and sort
            const allMessages = [...newMessages, ...prev.messages]
            const uniqueMessages = allMessages.filter((msg, index, arr) => {
              const msgId = msg.id || `${msg.username}-${msg.time}`
              return arr.findIndex(m => {
                const mId = m.id || `${m.username}-${m.time}`
                return mId === msgId
              }) === index
            }).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
            
            return {
              ...prev,
              messages: uniqueMessages,
              isLoading: false
            }
          } else {
            // Initial load - replace all messages
            return {
              ...prev,
              messages: newMessages,
              isLoading: false
            }
          }
        })
        
        // Check if there are more messages to load
        setHasMoreMessages(newMessages.length > 0)
        
      } else {
        throw new Error(data.error || 'Failed to load chat history')
      }
    } catch (error) {
      if (!mountedRef.current) return
      console.error('Error loading chat history:', error)
      setState(prev => ({
        ...prev,
        error: 'Failed to load chat history',
        isLoading: false
      }))
    } finally {
      if (append) {
        setIsLoadingMore(false)
      }
    }
  }, [roomId])

  // Load ALL available chat history (fetches until no more data)
  const loadAllChatHistory = useCallback(async () => {
    if (!mountedRef.current) return

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }))
      
      console.log('📚 [CHAT] Loading ALL chat history...')
      const allMessages = []
      let offset = 0
      const stepSize = 100 // Fetch in steps of 100 messages
      
      // Load messages in batches until we get no more data
      while (true) {
        const response = await fetch(`/Test/api/chat?roomId=${roomId}&offset=${offset}`)
        const data = await response.json()
        
        if (!mountedRef.current) return
        
        // Stop if request failed or no messages returned
        if (!data.success || !data.messages || data.messages.length === 0) {
          console.log(`📚 [CHAT] No more messages. Offset: ${offset}, Total messages: ${allMessages.length}`)
          break
        }
        
        allMessages.push(...data.messages)
        console.log(`📚 [CHAT] Loaded batch at offset ${offset}: ${data.messages.length} messages (Total so far: ${allMessages.length})`)
        
        // Move to next batch
        offset += stepSize
      }
      
      // Remove duplicates and sort by time
      const uniqueMessages = allMessages.filter((msg, index, arr) => {
        const msgId = msg.id || `${msg.username}-${msg.time}`
        return arr.findIndex(m => {
          const mId = m.id || `${m.username}-${m.time}`
          return mId === msgId
        }) === index
      }).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
      
      console.log(`✅ [CHAT] Loaded ${uniqueMessages.length} unique messages from ${allMessages.length} total fetched`)
      
      setState(prev => ({
        ...prev,
        messages: uniqueMessages,
        isLoading: false
      }))
        
    } catch (error) {
      if (!mountedRef.current) return
      console.error('Error loading chat history:', error)
      setState(prev => ({
        ...prev,
        error: 'Failed to load chat history',
        isLoading: false
      }))
    }
  }, [roomId])

  // Load more messages (pagination) - uses correct offset (message count, not timestamp)
  const loadMoreMessages = useCallback(async () => {
    if (!mountedRef.current || isLoadingMore || !hasMoreMessages) return
    
    // The offset is the number of messages to skip (message count)
    const offset = state.messages.length
    
    console.log('📚 [CHAT] Loading more messages with offset:', offset)
    await loadChatHistory(offset, true)
  }, [loadChatHistory, state.messages, isLoadingMore, hasMoreMessages])

  // Connect to Server-Sent Events stream
  const connectSSE = useCallback(() => {
    if (!mountedRef.current) return
    
    // Clean up existing connection
    if (sseRef.current) {
      sseRef.current.close()
      sseRef.current = null
    }
    
    try {
      console.log('🌊 Starting SSE connection for room:', roomId, 'polling:', pollingEnabled, 'interval:', pollingInterval)
      const params = new URLSearchParams({
        roomId,
        enablePolling: pollingEnabled.toString(),
        pollingInterval: pollingInterval.toString()
      })
      const eventSource = new EventSource(`/Test/api/chat-stream?${params}`)
      
      eventSource.onopen = () => {
        if (!mountedRef.current) return
        console.log('✅ SSE connection established')
        setState(prev => ({ ...prev, isConnected: true, error: null }))
      }
      
      eventSource.onmessage = (event) => {
        if (!mountedRef.current) return
        
        try {
          const data = JSON.parse(event.data)
          
          if (data.type === 'message' && data.data) {
            setState(prev => {
              // Create message ID for deduplication
              const messageId = data.data.id || `${data.data.username}-${data.data.time}`
              
              // Avoid duplicates
              const messageExists = prev.messages.some(msg => {
                const existingId = msg.id || `${msg.username}-${msg.time}`
                return existingId === messageId
              })
              
              if (messageExists) {
                console.log('🔄 [SSE] Duplicate message ignored:', messageId)
                return prev
              }
              
              console.log('✅ [SSE] Adding new message:', messageId)
              const newMessages = [...prev.messages, data.data].sort(
                (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
              )
              
              return { ...prev, messages: newMessages }
            })
          } else if (data.type === 'messages_deleted' && data.data?.deletedIds) {
            setState(prev => {
              console.log('🗑️ [SSE] Processing deleted messages:', data.data.deletedIds)
              
              const filteredMessages = prev.messages.filter(msg => {
                const messageId = msg.id || `${msg.username}-${msg.time}`
                return !data.data.deletedIds.includes(messageId)
              })
              
              console.log(`🗑️ [SSE] Removed ${prev.messages.length - filteredMessages.length} deleted messages`)
              
              return { ...prev, messages: filteredMessages }
            })
          } else if (data.type === 'connection') {
            console.log('🔗 [SSE] Connection status:', data.status)
          }
        } catch (error) {
          console.warn('Error parsing SSE message:', error)
        }
      }
      
      eventSource.onerror = (error) => {
        if (!mountedRef.current) return
        console.error('SSE connection error:', error)
        setState(prev => ({ ...prev, isConnected: false }))
      }
      
      sseRef.current = eventSource
    } catch (error) {
      console.error('Failed to create SSE connection:', error)
      setState(prev => ({ ...prev, error: 'Failed to connect to chat' }))
    }
  }, [roomId, pollingEnabled, pollingInterval])

  // Send message via API
  const sendMessage = useCallback(async (message: string) => {
    if (!mountedRef.current) return false

    try {
      const response = await fetch('/Test/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roomId, message }),
      })

      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to send message')
      }
      
      return true
    } catch (error) {
      console.error('Error sending message:', error)
      setState(prev => ({
        ...prev,
        error: 'Failed to send message'
      }))
      return false
    }
  }, [roomId])

  // Utility functions
  const disconnect = useCallback(() => {
    mountedRef.current = false
    
    if (sseRef.current) {
      sseRef.current.close()
      sseRef.current = null
    }
    
    setState(prev => ({ ...prev, isConnected: false }))
  }, [])

  const clearError = useCallback(() => {
    if (!mountedRef.current) return
    setState(prev => ({ ...prev, error: null }))
  }, [])

  const reconnect = useCallback(() => {
    if (!mountedRef.current) return
    connectSSE()
  }, [connectSSE])

  // Initialize on mount - load ALL available chat history
  useEffect(() => {
    mountedRef.current = true
    loadAllChatHistory()
    
    return () => {
      mountedRef.current = false
    }
  }, [loadAllChatHistory])

  // Connect to SSE stream
  useEffect(() => {
    if (!mountedRef.current) return
    
    const timer = setTimeout(() => {
      if (mountedRef.current) {
        connectSSE()
      }
    }, 1000) // Delay connection slightly after component mount
    
    return () => {
      clearTimeout(timer)
      disconnect()
    }
  }, [connectSSE, disconnect])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (sseRef.current) {
        sseRef.current.close()
      }
    }
  }, [])

  return {
    ...state,
    sendMessage,
    disconnect,
    reconnect,
    clearError,
    refresh: loadAllChatHistory,
    loadMoreMessages,
    isLoadingMore,
    hasMoreMessages
  }
}
