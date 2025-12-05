import { useState, useEffect, useCallback, useRef } from 'react'
import { format, subDays } from 'date-fns'

interface ActivityData {
  date: string
  count: number
  messages?: Array<{
    id: string
    text: string
    time: string
  }>
}

interface ActivityPatterns {
  hourCounts: { [hour: number]: number }
  totalMessages: number
}

// Cache configuration
const ACTIVITY_CACHE_PREFIX = 'user_activity_'
const ACTIVITY_CACHE_DURATION = 24 * 60 * 60 * 1000 // 1 day in milliseconds

// In-memory cache for faster subsequent accesses
const activityMemoryCache = new Map<string, {
  activities: ActivityData[]
  patterns: ActivityPatterns
  expiry: number
}>()

// Track pending requests for deduplication
const pendingActivityRequests = new Map<string, Promise<{
  activities: ActivityData[]
  patterns: ActivityPatterns
} | null>>()

interface CachedActivityData {
  activities: ActivityData[]
  patterns: ActivityPatterns
  timestamp: number
  expiry: number
}

function getActivityCacheKey(username: string, roomId: string, days: number): string {
  return `${ACTIVITY_CACHE_PREFIX}${roomId}_${username}_${days}d`
}

function getActivityFromCache(username: string, roomId: string, days: number): CachedActivityData | null {
  const cacheKey = getActivityCacheKey(username, roomId, days)
  const now = Date.now()
  
  // Check memory cache first (fastest)
  const memCached = activityMemoryCache.get(cacheKey)
  if (memCached && now < memCached.expiry) {
    return {
      activities: memCached.activities,
      patterns: memCached.patterns,
      timestamp: now,
      expiry: memCached.expiry
    }
  }
  
  // Check localStorage
  if (typeof window === 'undefined') return null
  
  try {
    const cached = localStorage.getItem(cacheKey)
    if (!cached) return null
    
    const entry: CachedActivityData = JSON.parse(cached)
    
    if (now < entry.expiry) {
      // Update memory cache
      activityMemoryCache.set(cacheKey, {
        activities: entry.activities,
        patterns: entry.patterns,
        expiry: entry.expiry
      })
      
      return entry
    }
    
    // Expired, remove it
    localStorage.removeItem(cacheKey)
    activityMemoryCache.delete(cacheKey)
    return null
  } catch (error) {
    console.warn('[ACTIVITY CACHE] Failed to read:', error)
    return null
  }
}

function saveActivityToCache(
  username: string, 
  roomId: string, 
  days: number, 
  activities: ActivityData[], 
  patterns: ActivityPatterns
): void {
  const cacheKey = getActivityCacheKey(username, roomId, days)
  const now = Date.now()
  const expiry = now + ACTIVITY_CACHE_DURATION
  
  // Save to memory cache
  activityMemoryCache.set(cacheKey, { activities, patterns, expiry })
  
  // Save to localStorage
  if (typeof window === 'undefined') return
  
  try {
    const entry: CachedActivityData = {
      activities,
      patterns,
      timestamp: now,
      expiry
    }
    
    localStorage.setItem(cacheKey, JSON.stringify(entry))
  } catch (error) {
    console.warn('[ACTIVITY CACHE] Failed to write:', error)
  }
}

function calculatePatterns(activities: ActivityData[]): ActivityPatterns {
  const hourCounts: { [hour: number]: number } = {}
  let totalMessages = 0

  // Initialize all hours
  for (let i = 0; i < 24; i++) {
    hourCounts[i] = 0
  }

  // Count messages by hour
  activities.forEach(activity => {
    totalMessages += activity.count
    activity.messages?.forEach(msg => {
      try {
        const date = new Date(parseFloat(msg.time) * 1000)
        const hour = date.getHours()
        hourCounts[hour] = (hourCounts[hour] || 0) + 1
      } catch {
        // Skip invalid times
      }
    })
  })

  return {
    hourCounts,
    totalMessages
  }
}

/**
 * Hook to fetch user activity data
 * 
 * OPTIMIZED:
 * - Request deduplication (only one request per user)
 * - Memory + localStorage caching
 * - Skip fetch if no username
 */
export function useUserActivity(username: string, roomId: string = 'bitcoin_de_DE', days: number = 30) {
  const [activities, setActivities] = useState<ActivityData[]>([])
  const [patterns, setPatterns] = useState<ActivityPatterns | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasFetchedRef = useRef(false)

  const fetchActivity = useCallback(async () => {
    if (!username || !roomId) return

    const cacheKey = getActivityCacheKey(username, roomId, days)

    // 1. Check cache first
    const cached = getActivityFromCache(username, roomId, days)
    if (cached) {
      setActivities(cached.activities)
      setPatterns(cached.patterns)
      setIsLoading(false)
      setError(null)
      return
    }

    // 2. Check if request is already in flight (DEDUPLICATION)
    const pending = pendingActivityRequests.get(cacheKey)
    if (pending) {
      try {
        const result = await pending
        if (result) {
          setActivities(result.activities)
          setPatterns(result.patterns)
        }
        setIsLoading(false)
        return
      } catch {
        setIsLoading(false)
        return
      }
    }

    setIsLoading(true)
    setError(null)

    // 3. Create and track the request
    const requestPromise = (async () => {
      try {
        // Generate dates for the requested period
        const today = new Date()
        const dates: string[] = []
        for (let i = 0; i < days; i++) {
          dates.push(format(subDays(today, i), 'yyyy-MM-dd'))
        }
        
        // Fetch from API - it handles database caching
        const response = await fetch('/api/chat-activity', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            room: roomId,
            username,
            dates
          }),
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()
        
        if (data.activities) {
          const activityData = data.activities as ActivityData[]
          const activityPatterns = calculatePatterns(activityData)
          
          // Save to cache
          saveActivityToCache(username, roomId, days, activityData, activityPatterns)
          
          return { activities: activityData, patterns: activityPatterns }
        }
        
        return null
      } catch (err) {
        console.error('[useUserActivity] Error:', err)
        throw err
      }
    })()

    // Track the pending request
    pendingActivityRequests.set(cacheKey, requestPromise)

    try {
      const result = await requestPromise
      if (result) {
        setActivities(result.activities)
        setPatterns(result.patterns)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch activity')
    } finally {
      setIsLoading(false)
      pendingActivityRequests.delete(cacheKey)
    }
  }, [username, roomId, days])

  useEffect(() => {
    // Skip if already fetched for this user
    if (hasFetchedRef.current) return
    
    // Only fetch if we have a username
    if (!username) return

    hasFetchedRef.current = true
    fetchActivity()
  }, [fetchActivity, username])

  // Reset when user changes
  useEffect(() => {
    hasFetchedRef.current = false
  }, [username])

  return {
    activities,
    patterns,
    isLoading,
    error,
    refetch: fetchActivity
  }
}
