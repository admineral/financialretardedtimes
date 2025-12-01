'use client'

import { useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { useRouter } from 'next/navigation'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { UserHoverCard } from './UserHoverCard'
import { useChat } from '../hooks/use-chat-improved'
import { UserIcon, ExternalLinkIcon } from 'lucide-react'
import { format, subDays } from 'date-fns'

interface ChatterInfo {
  username: string
  messageCount: number
  avatar?: string
  isBot?: boolean
  lastMessageTime: string
}

interface ChatterFetchStatus {
  username: string
  status: 'idle' | 'fetching' | 'complete' | 'error'
  cachedCount?: number // How many days came from cache
  fetchedCount?: number // How many days were fetched fresh
}

interface ChattersListProps {
  roomId: string
  onRefreshStateChange?: (isRefreshing: boolean) => void
}

export interface ChattersListRef {
  triggerRefresh: () => void
}

export const ChattersList = forwardRef<ChattersListRef, ChattersListProps>(function ChattersList({ roomId, onRefreshStateChange }, ref) {
  const { messages, isLoading: isChatLoading } = useChat({ roomId })
  const [chatters, setChatters] = useState<ChatterInfo[]>([])
  const [fetchStatuses, setFetchStatuses] = useState<Map<string, ChatterFetchStatus>>(new Map())
  const [fetchTrigger, setFetchTrigger] = useState(0) // Used to trigger refetch
  const [isForceRefresh, setIsForceRefresh] = useState(false) // Track if this is a force refresh
  const [isFetchingComplete, setIsFetchingComplete] = useState(false) // Track if all fetches are done
  const router = useRouter()
  const isMountedRef = useRef(true)
  const chattersRef = useRef(chatters)
  const isChatLoadingRef = useRef(isChatLoading)
  const fetchStatusesRef = useRef(fetchStatuses)

  // Update chatters ref whenever chatters change
  useEffect(() => {
    chattersRef.current = chatters
  }, [chatters])

  // Update loading ref whenever loading state changes
  useEffect(() => {
    isChatLoadingRef.current = isChatLoading
  }, [isChatLoading])

  // Update fetchStatuses ref whenever fetchStatuses change
  useEffect(() => {
    fetchStatusesRef.current = fetchStatuses
  }, [fetchStatuses])

  // Cleanup on unmount - abort all fetches
  useEffect(() => {
    isMountedRef.current = true
    
    // Copy refs to local variables for cleanup
    const abortControllers = abortControllersRef.current
    const fetchingUsers = fetchingUsersRef.current
    
    // Handle window close/unload
    const handleBeforeUnload = () => {
      console.log('[ChattersList] 🚪 Window closing - aborting all fetches')
      isMountedRef.current = false
      
      // Abort all active fetches
      abortControllers.forEach((controller: AbortController, username: string) => {
        console.log(`[ChattersList] ${username}: 🛑 Aborting fetch (window close)`)
        controller.abort()
      })
      abortControllers.clear()
      fetchingUsers.clear()
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      console.log('[ChattersList] 🧹 Component unmounting - aborting all fetches')
      isMountedRef.current = false
      
      window.removeEventListener('beforeunload', handleBeforeUnload)
      
      // Abort all active fetches
      abortControllers.forEach((controller: AbortController, username: string) => {
        console.log(`[ChattersList] ${username}: 🛑 Aborting fetch (unmount)`)
        controller.abort()
      })
      abortControllers.clear()
      fetchingUsers.clear()
    }
  }, [])

  // Expose refresh method to parent via ref
  useImperativeHandle(ref, () => ({
    triggerRefresh: () => {
      handleRefresh(new Event('click'))
    }
  }))

  // Track previous chatters to detect new ones
  const [previousChatterUsernames, setPreviousChatterUsernames] = useState<Set<string>>(new Set())

  // Process messages to extract chatters
  useEffect(() => {
    console.log('[ChattersList] 📊 Processing messages:', messages.length)
    const chatterMap = new Map<string, ChatterInfo>()

    messages.forEach((message) => {
      const existing = chatterMap.get(message.username)
      
      if (existing) {
        existing.messageCount++
        // Update last message time if this message is newer
        if (new Date(message.time) > new Date(existing.lastMessageTime)) {
          existing.lastMessageTime = message.time
        }
        // Update avatar if not set yet (use the richer avatar data)
        if (!existing.avatar && (message.user_pic || message.avatar)) {
          existing.avatar = message.user_pic || message.avatar
        }
      } else {
        chatterMap.set(message.username, {
          username: message.username,
          messageCount: 1,
          avatar: message.user_pic || message.avatar,
          isBot: message.isBot,
          lastMessageTime: message.time
        })
      }
    })

    // Convert to array and sort by message count (descending)
    const chattersArray = Array.from(chatterMap.values()).sort((a, b) => {
      // First sort by message count (descending)
      if (b.messageCount !== a.messageCount) {
        return b.messageCount - a.messageCount
      }
      // Then by last message time (most recent first)
      return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
    })

    console.log('[ChattersList] 👥 Extracted chatters:', chattersArray.length, chattersArray.map(c => c.username).join(', '))
    
    // Detect new chatters
    const currentUsernames = new Set(chattersArray.map(c => c.username))
    const newChatters = chattersArray.filter(c => !previousChatterUsernames.has(c.username))
    
    if (newChatters.length > 0) {
      console.log('[ChattersList] 🆕 New chatters detected:', newChatters.map(c => c.username).join(', '))
      // Queue fetch for new chatters only (they'll be picked up by the fetch loop)
      setPreviousChatterUsernames(currentUsernames)
    }
    
    setChatters(chattersArray)
    
    // No need to trigger fetch - the loop waits for all messages to load automatically
  }, [messages, chatters.length, previousChatterUsernames])

  // Track active fetch abort controllers
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())
  
  // Track users currently being fetched to prevent duplicates
  const fetchingUsersRef = useRef<Set<string>>(new Set())

  // Function to fetch activity data for a user (30 days via Supabase-backed API)
  const fetchUserActivity = useCallback(async (username: string, forceRefresh: boolean = false) => {
    if (!roomId || !username) return

    // CRITICAL: Check if already fetching this user
    if (fetchingUsersRef.current.has(username)) {
      console.warn(`[ChattersList] ❌ ${username}: DUPLICATE REQUEST BLOCKED - Already in queue!`)
      return
    }

    // Add to fetching set
    fetchingUsersRef.current.add(username)
    console.log(`[ChattersList] ${username}: 🔒 Added to fetch queue. Queue size:`, fetchingUsersRef.current.size)

    // Cancel any existing fetch for this user
    const existingController = abortControllersRef.current.get(username)
    if (existingController) {
      console.log(`[ChattersList] ${username}: ⚠️ Aborting previous fetch`)
      existingController.abort()
      abortControllersRef.current.delete(username)
    }

    // Create new abort controller for this fetch
    const abortController = new AbortController()
    abortControllersRef.current.set(username, abortController)

    // Update status to fetching
    setFetchStatuses(prev => {
      const newMap = new Map(prev)
      newMap.set(username, { username, status: 'fetching' })
      return newMap
    })

    try {
      // Generate dates for last 30 days
      const today = new Date()
      const dates: string[] = []
      for (let i = 0; i < 30; i++) {
        dates.push(format(subDays(today, i), 'yyyy-MM-dd'))
      }

      console.log(`[ChattersList] ${username}: 🌐 Fetching activity via API ${forceRefresh ? '(FORCE REFRESH)' : ''}`)
      
      const response = await fetch('/api/chat-activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          room: roomId,
          username,
          dates,
          forceRefresh
        }),
        signal: abortController.signal
      })

      // Check if aborted
      if (abortController.signal.aborted) {
        console.log(`[ChattersList] ${username}: ⚠️ Aborted after fetch`)
        return
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch activity: ${response.statusText}`)
      }

      const data = await response.json()

      // Check if aborted before processing
      if (abortController.signal.aborted) {
        console.log(`[ChattersList] ${username}: ⚠️ Aborted after receiving data`)
        return
      }

      // Update status to complete with cache info
      setFetchStatuses(prev => {
        const newMap = new Map(prev)
        newMap.set(username, { 
          username, 
          status: 'complete',
          cachedCount: data.cachedCount || 0,
          fetchedCount: data.fetchedCount || 0
        })
        return newMap
      })
      
      console.log(`[ChattersList] ${username}: ✅ Fetch complete (${data.cachedCount || 0} cached, ${data.fetchedCount || 0} fetched)`)
      
      // Clean up
      abortControllersRef.current.delete(username)
      fetchingUsersRef.current.delete(username)
    } catch (error) {
      // Don't log abort errors as real errors
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`[ChattersList] ${username}: 🛑 Fetch aborted`)
        setFetchStatuses(prev => new Map(prev).set(username, { username, status: 'idle' }))
        abortControllersRef.current.delete(username)
        fetchingUsersRef.current.delete(username)
        return
      }
      
      console.error(`[ChattersList] ${username}: ❌ Error fetching activity:`, error)
      setFetchStatuses(prev => new Map(prev).set(username, { username, status: 'error' }))
      abortControllersRef.current.delete(username)
      fetchingUsersRef.current.delete(username)
    }
  }, [roomId])

  // Continuously fetch activity data for chatters (handles dynamically added users)
  useEffect(() => {
    if (!roomId) {
      console.log('[ChattersList] 🛑 No roomId')
      return
    }

    let isCancelled = false
    let isProcessing = false

    const fetchLoop = async () => {
      // Wait for ALL messages to load first
      console.log('[ChattersList] ⏳ Waiting for all messages to load...')
      while (isChatLoadingRef.current && !isCancelled && isMountedRef.current) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      console.log('[ChattersList] ✅ All messages loaded, starting fetch loop')

      while (!isCancelled && isMountedRef.current) {
        // Get current chatters from ref
        const currentChatters = chattersRef.current
        
        // Wait if no chatters yet
        if (currentChatters.length === 0) {
          console.log('[ChattersList] ⏳ Waiting for chatters...')
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }

        // Skip if already processing (prevents overlapping loops)
        if (isProcessing) {
          await new Promise(resolve => setTimeout(resolve, 500))
          continue
        }

        isProcessing = true
        setIsFetchingComplete(false)
        console.log(`[ChattersList] 🔄 Fetch loop iteration - ${currentChatters.length} chatters total`)
        
        let hasWorkToDo = false
        
        // Fetch users in order (top to bottom)
        for (let i = 0; i < currentChatters.length; i++) {
          if (isCancelled || !isMountedRef.current) break
          
          const chatter = currentChatters[i]
          const currentStatus = fetchStatusesRef.current.get(chatter.username)
          const isCurrentlyFetching = fetchingUsersRef.current.has(chatter.username)
          
          // If force refresh, always fetch (unless already in progress)
          if (isForceRefresh && !isCurrentlyFetching) {
            console.log(`[ChattersList] 🔄 Force fetching ${chatter.username}`)
            await fetchUserActivity(chatter.username, true)
            await new Promise(resolve => setTimeout(resolve, 300))
            hasWorkToDo = true
            continue
          }
          
          // Skip if already complete or currently fetching
          if (currentStatus && (currentStatus.status === 'complete' || currentStatus.status === 'fetching')) {
            continue
          }
          
          // CRITICAL: Also check the fetchingUsersRef to prevent duplicate fetches
          if (isCurrentlyFetching) {
            console.log(`[ChattersList] ⏭️  Skipping ${chatter.username} - already being fetched`)
            continue
          }
          
          // Fetch this user
          console.log(`[ChattersList] 📥 Fetching ${chatter.username} (#${i + 1})`)
          await fetchUserActivity(chatter.username, false)
          await new Promise(resolve => setTimeout(resolve, 300))
          hasWorkToDo = true
        }
        
        // Reset force refresh flag after completing
        if (isForceRefresh) {
          console.log('[ChattersList] 🔄 Resetting force refresh flag')
          setIsForceRefresh(false)
          onRefreshStateChange?.(false)
        }
        
        isProcessing = false
        
        if (!hasWorkToDo) {
          console.log('[ChattersList] ✅ All chatters processed')
          setIsFetchingComplete(true)
        }
        
        // Wait before next check (poll for new chatters)
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    // Copy refs to local variables for cleanup
    const abortControllers = abortControllersRef.current
    const fetchingUsers = fetchingUsersRef.current
    
    fetchLoop()

    return () => {
      console.log('[ChattersList] 🧹 Cleanup - aborting all active fetches')
      isCancelled = true
      
      // Abort all active fetches
      abortControllers.forEach((controller: AbortController, username: string) => {
        console.log(`[ChattersList] ${username}: 🛑 Aborting fetch (cleanup)`)
        controller.abort()
      })
      abortControllers.clear()
      fetchingUsers.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, fetchTrigger, isForceRefresh])

  // Handle refresh - refetch for all users (API handles cache invalidation)
  const handleRefresh = useCallback((e: React.MouseEvent | Event) => {
    if (e instanceof MouseEvent) {
      e.preventDefault()
      e.stopPropagation()
    }
    
    console.log('[ChattersList] 🔄 REFRESH CLICKED - Forcing refetch for all users')
    console.log('[ChattersList] Current chatters:', chatters.length)
    
    onRefreshStateChange?.(true)
    
    // Set force refresh flag to bypass cache
    setIsForceRefresh(true)
    
    // Reset completion flag
    setIsFetchingComplete(false)
    
    // Clear all fetch statuses to reset indicators
    setFetchStatuses(new Map())
    
    // Increment trigger to restart the fetch useEffect
    setFetchTrigger(prev => {
      const newValue = prev + 1
      console.log('[ChattersList] Fetch trigger updated:', prev, '->', newValue)
      return newValue
    })
  }, [chatters, onRefreshStateChange])

  const handleUserClick = (username: string, event: React.MouseEvent) => {
    // Prevent the hover card from interfering
    event.stopPropagation()
    router.push(`/chat-archive?username=${encodeURIComponent(username)}&room=bitcoin_de_DE`)
  }

  if (isChatLoading && messages.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-3 w-20 mb-1" />
              <Skeleton className="h-2 w-12" />
            </div>
            <Skeleton className="h-4 w-6" />
          </div>
        ))}
      </div>
    )
  }

  if (chatters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">No chatters yet</p>
        <p className="text-xs">Waiting for messages...</p>
      </div>
    )
  }

  // Calculate fetch progress
  const totalChatters = chatters.length
  const completedFetches = Array.from(fetchStatuses.values()).filter(s => s.status === 'complete').length
  const activeFetches = Array.from(fetchStatuses.values()).filter(s => s.status === 'fetching').length
  const erroredFetches = Array.from(fetchStatuses.values()).filter(s => s.status === 'error').length
  const totalProcessed = completedFetches + erroredFetches
  const hasPendingFetches = !isFetchingComplete && (activeFetches > 0 || totalProcessed < totalChatters)

  return (
    <div className="h-full flex flex-col">
      {/* Fetch Progress Indicator - Only show after all messages are loaded and we're fetching activity */}
      {totalChatters > 0 && !isChatLoading && !isFetchingComplete && (
        <div className="mb-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg animate-in fade-in-0 slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 mb-2">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="font-medium">Loading activity data...</span>
            </div>
            <span className="font-mono font-bold">{totalProcessed}/{totalChatters}</span>
          </div>
          <div className="h-2 bg-blue-500/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 ease-out"
              style={{ width: `${totalChatters > 0 ? (totalProcessed / totalChatters) * 100 : 0}%` }}
            />
          </div>
          {erroredFetches > 0 && (
            <div className="mt-2 text-[10px] text-red-600 dark:text-red-400 font-medium">
              ⚠️ {erroredFetches} failed
            </div>
          )}
        </div>
      )}
      
      <ScrollArea className="flex-1 h-full">
        <div className="space-y-2 pr-4">
        {chatters.map((chatter) => {
          const userMessages = messages.filter(msg => msg.username === chatter.username)
          const fetchStatus = fetchStatuses.get(chatter.username)
          
          return (
            <UserHoverCard 
              key={chatter.username}
              username={chatter.username} 
              userMessages={userMessages}
              side="right"
            >
              <div 
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                onClick={(e) => handleUserClick(chatter.username, e)}
              >
                <Avatar className="h-8 w-8 border-2 border-primary/30 shadow-sm ring-1 ring-primary/20 hover:border-primary/50 hover:ring-2 hover:ring-primary/30 transition-all duration-200">
                  <AvatarImage 
                    src={chatter.avatar} 
                    alt={chatter.username}
                    className="rounded-full object-cover"
                  />
                  <AvatarFallback className="text-xs bg-muted/50 rounded-full">
                    {chatter.avatar ? (
                      chatter.username.slice(0, 2).toUpperCase()
                    ) : (
                      <UserIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                      {chatter.username}
                    </span>
                    <ExternalLinkIcon className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
                
                <div className="flex items-center gap-1.5">
                  {/* Priority 1: Show loading status during active fetch */}
                  {fetchStatus?.status === 'fetching' ? (
                    <div className="relative flex items-center justify-center w-5 h-5">
                      <div className="h-2 w-2 rounded-full bg-blue-500 animate-ping absolute" />
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                    </div>
                  ) : fetchStatus?.status === 'error' ? (
                    /* Priority 2: Show error status */
                    <div className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-md ring-2 ring-red-300 animate-pulse" title="Fetch failed" />
                  ) : fetchStatus?.status === 'complete' ? (
                    /* Priority 3: Show completion status - green if fetched fresh, orange if mostly from cache */
                    <div 
                      className={`h-2.5 w-2.5 rounded-full shadow-md ring-2 ${
                        (fetchStatus.fetchedCount || 0) > 0
                          ? 'bg-green-500 ring-green-300' 
                          : 'bg-orange-500 ring-orange-300'
                      }`}
                      title={
                        (fetchStatus.fetchedCount || 0) > 0
                          ? `Fetched ${fetchStatus.fetchedCount} days fresh, ${fetchStatus.cachedCount} from cache`
                          : `All ${fetchStatus.cachedCount} days from database cache`
                      }
                    />
                  ) : null}
                  <Badge variant="outline" className="text-xs">
                    {chatter.messageCount}
                  </Badge>
                </div>
              </div>
            </UserHoverCard>
          )
        })}
        </div>
      </ScrollArea>
    </div>
  )
})
