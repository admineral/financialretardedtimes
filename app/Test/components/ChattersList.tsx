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
import { getAvailableCachedDates, setClientCachedActivity, clearClientActivityCache } from '@/lib/client-activity-cache'
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
  fromCache?: boolean // Track if data came from cache
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

  // Function to fetch activity data for a user (30 days for hover card)
  const fetchUserActivity = useCallback(async (username: string, forceRefresh: boolean = false) => {
    if (!roomId || !username) return

    // CRITICAL: Check if already fetching this user
    if (fetchingUsersRef.current.has(username)) {
      console.warn(`[ChattersList] ❌ ${username}: DUPLICATE REQUEST BLOCKED - Already in queue!`)
      console.warn(`[ChattersList] Current queue:`, Array.from(fetchingUsersRef.current))
      return
    }

    // Add to fetching set
    fetchingUsersRef.current.add(username)
    console.log(`[ChattersList] ${username}: 🔒 Added to fetch queue. Queue size:`, fetchingUsersRef.current.size)

    // Cancel any existing fetch for this user (shouldn't happen now)
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
      console.log(`[ChattersList] ${username}: 🔵 Status set to 'fetching'`)
      return newMap
    })

    try {
      // Generate dates for last 30 days (for activity bar chart in hover)
      const today = new Date()
      const dates: string[] = []
      for (let i = 0; i < 30; i++) {
        dates.push(format(subDays(today, i), 'yyyy-MM-dd'))
      }

      // Check which dates are already cached in localStorage
      const cachedDates = getAvailableCachedDates(roomId, dates, username)
      const datesToFetch = forceRefresh ? dates : dates.filter(date => !cachedDates.includes(date))

      console.log(`[ChattersList] ${username}: ${cachedDates.length}/30 days cached, fetching ${datesToFetch.length} days ${forceRefresh ? '(FORCE REFRESH)' : ''}`)

      // If all data is cached and not forcing refresh, mark as complete immediately
      if (datesToFetch.length === 0 && !forceRefresh) {
        console.log(`[ChattersList] ${username}: ✅ All data cached, skipping fetch`)
        // Use a small delay to ensure UI updates properly
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // Check if aborted before updating status
        if (abortController.signal.aborted) {
          console.log(`[ChattersList] ${username}: ⚠️ Aborted after cache check`)
          fetchingUsersRef.current.delete(username)
          return
        }
        
        setFetchStatuses(prev => new Map(prev).set(username, { username, status: 'complete', fromCache: true }))
        abortControllersRef.current.delete(username)
        fetchingUsersRef.current.delete(username)
        console.log(`[ChattersList] ${username}: 🔓 Removed from fetch queue (cached)`)
        return
      }

      // Fetch dates from API (either missing dates or all dates if force refresh)
      console.log(`[ChattersList] ${username}: 🌐 Fetching ${datesToFetch.length} days from API`)
      const response = await fetch('/api/chat-activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          room: roomId,
          username,
          dates: datesToFetch,
          stream: false // Use non-streaming for background fetch
        }),
        signal: abortController.signal // Add abort signal
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

      // Cache the fetched data to localStorage
      if (data.activities && Array.isArray(data.activities)) {
        data.activities.forEach((activity: { date: string; count: number; messages: Array<{ id: string; text: string; time: string; avatar?: string }> }) => {
          setClientCachedActivity(
            roomId,
            activity.date,
            username,
            activity.count,
            activity.messages || []
          )
        })
        console.log(`[ChattersList] ${username}: 💾 Cached ${data.activities.length} days to localStorage`)
      }

      // Update status to complete (from API, not cache)
      setFetchStatuses(prev => {
        const newMap = new Map(prev)
        newMap.set(username, { username, status: 'complete', fromCache: false })
        console.log(`[ChattersList] ${username}: ✅ Fetch complete - updating status map. New size:`, newMap.size)
        return newMap
      })
      console.log(`[ChattersList] ${username}: ✅ Fetch complete`)
      
      // Clean up abort controller and remove from fetching set
      abortControllersRef.current.delete(username)
      fetchingUsersRef.current.delete(username)
      console.log(`[ChattersList] ${username}: 🔓 Removed from fetch queue`)
    } catch (error) {
      // Don't log abort errors as real errors
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`[ChattersList] ${username}: 🛑 Fetch aborted`)
        setFetchStatuses(prev => new Map(prev).set(username, { username, status: 'idle' }))
        abortControllersRef.current.delete(username)
        fetchingUsersRef.current.delete(username)
        console.log(`[ChattersList] ${username}: 🔓 Removed from fetch queue (aborted)`)
        return
      }
      
      console.error(`[ChattersList] ${username}: ❌ Error fetching activity:`, error)
      setFetchStatuses(prev => new Map(prev).set(username, { username, status: 'error' }))
      abortControllersRef.current.delete(username)
      fetchingUsersRef.current.delete(username)
      console.log(`[ChattersList] ${username}: 🔓 Removed from fetch queue (error)`)
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
        
        // Pre-check cache for all users to determine fetch order
        const today = new Date()
        const dates: string[] = []
        for (let j = 0; j < 30; j++) {
          dates.push(format(subDays(today, j), 'yyyy-MM-dd'))
        }
        
        // First pass: Mark users with full cache as complete instantly
        // Batch all status updates together to avoid multiple re-renders
        const usersToMarkComplete: string[] = []
        for (const chatter of currentChatters) {
          const currentStatus = fetchStatusesRef.current.get(chatter.username)
          if (!currentStatus) {
            const cachedDates = getAvailableCachedDates(roomId, dates, chatter.username)
            if (cachedDates.length === 30) {
              console.log(`[ChattersList] ✅ ${chatter.username}: Using full cache (30/30 days)`)
              usersToMarkComplete.push(chatter.username)
            }
          }
        }
        
        // Batch update all users at once
        if (usersToMarkComplete.length > 0) {
          setFetchStatuses(prev => {
            const newMap = new Map(prev)
            usersToMarkComplete.forEach(username => {
              newMap.set(username, {
                username,
                status: 'complete',
                fromCache: true
              })
            })
            return newMap
          })
        }
        
        let hasWorkToDo = false
        
        // Second pass: Fetch users in order (top to bottom)
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
          
          // Fetch this user (either no cache or partial cache)
          const cachedDates = getAvailableCachedDates(roomId, dates, chatter.username)
          console.log(`[ChattersList] 📥 Fetching ${chatter.username} (#${i + 1}, ${cachedDates.length}/30 days cached)`)
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
  }, [roomId, fetchTrigger, isForceRefresh]) // Removed 'chatters' dependency - using ref instead

  // Handle refresh - clear localStorage cache and refetch for all users
  const handleRefresh = useCallback((e: React.MouseEvent | Event) => {
    if (e instanceof MouseEvent) {
      e.preventDefault()
      e.stopPropagation()
    }
    
    console.log('[ChattersList] 🔄 REFRESH CLICKED - Clearing cache and refetching activity data for all users')
    console.log('[ChattersList] Current chatters:', chatters.length)
    
    onRefreshStateChange?.(true)
    
    // Clear localStorage cache for all chatters
    chatters.forEach(chatter => {
      console.log(`[ChattersList] 🗑️  Clearing cache for ${chatter.username}`)
      clearClientActivityCache(roomId, chatter.username)
    })
    
    // Set force refresh flag to bypass cache check
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
  }, [chatters, roomId, onRefreshStateChange])

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
  
  // Debug: Log render state
  console.log('[ChattersList RENDER]', {
    totalChatters,
    fetchStatusesSize: fetchStatuses.size,
    activeFetches,
    completedFetches,
    erroredFetches,
    hasPendingFetches,
    isFetchingComplete,
    statuses: Array.from(fetchStatuses.entries()).map(([u, s]) => `${u}:${s.status}`).join(', ')
  })

  return (
    <div className="h-full flex flex-col">
      {/* Fetch Progress Indicator - Only show after all messages are loaded and we're fetching activity */}
      {totalChatters > 0 && !isChatLoading && !isFetchingComplete && (
        <div className="mb-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg animate-in fade-in-0 slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 mb-2">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="font-medium">Checking cache & loading data...</span>
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
          
          // Check if user has cached data (30 days) - simple check on render
          const today = new Date()
          const last30Days: string[] = []
          for (let i = 0; i < 30; i++) {
            last30Days.push(format(subDays(today, i), 'yyyy-MM-dd'))
          }
          const cachedDates = getAvailableCachedDates(roomId, last30Days, chatter.username)
          const hasCachedData = cachedDates.length > 0
          const cachePercentage = Math.round((cachedDates.length / 30) * 100)
          
          // Debug log for first user
          if (chatter.username === chatters[0]?.username) {
            console.log(`[ChattersList RENDER] ${chatter.username}:`, {
              status: fetchStatus?.status,
              fromCache: fetchStatus?.fromCache,
              hasCachedData,
              cachePercentage
            })
          }
          
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
                  ) : fetchStatus?.status === 'complete' && hasCachedData ? (
                    /* Priority 3: Show green dot if complete (regardless of time window), orange if from cache */
                    <div 
                      className={`h-2.5 w-2.5 rounded-full shadow-md ring-2 ${
                        fetchStatus.fromCache === false 
                          ? 'bg-green-500 ring-green-300' 
                          : 'bg-orange-500 ring-orange-300'
                      }`}
                      title={
                        fetchStatus.fromCache === false
                          ? `Fetched from API (fresh data) - ${cachedDates.length}/30 days cached`
                          : `${cachedDates.length}/30 days cached (${cachePercentage}%)`
                      }
                    />
                  ) : hasCachedData ? (
                    /* Priority 4: Show orange dot if data is cached but no fetch status */
                    <div 
                      className="h-2.5 w-2.5 rounded-full bg-orange-500 shadow-md ring-2 ring-orange-300" 
                      title={`${cachedDates.length}/30 days cached (${cachePercentage}%)`} 
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


