'use client'

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { format, subDays } from 'date-fns'

interface ActivityData {
  date: string // YYYY-MM-DD format
  count: number
  messages?: Array<{
    id: string
    text: string
    time: string
    avatar?: string
  }>
  fromCache?: boolean
}

interface ActivityPatterns {
  totalMessages: number
  peakHour: { hour: number; count: number; percentage: number }
  topHours: Array<{ hour: number; count: number; percentage: number }>
  hourCounts: { [hour: number]: number }
  daysWithFullData: number
  daysWithSampleData: number
  isComprehensive: boolean
}

interface ActivityContextType {
  // State
  room: string
  username: string
  selectedDate: Date
  selectedDays: 30 | 90 | 180 | 360
  activities: ActivityData[]
  activityPatterns: ActivityPatterns | null
  isLoading: boolean
  progress: { current: number; total: number }
  lastSyncTime: Date | null
  
  // Actions
  setRoom: (room: string) => void
  setUsername: (username: string) => void
  setSelectedDate: (date: Date) => void
  setSelectedDays: (days: 30 | 90 | 180 | 360) => void
  fetchActivities: (forceRefresh?: boolean) => Promise<void>
  refreshActivities: () => Promise<void>
}

const ActivityContext = createContext<ActivityContextType | undefined>(undefined)

export function useActivity() {
  const context = useContext(ActivityContext)
  if (!context) {
    throw new Error('useActivity must be used within ActivityProvider')
  }
  return context
}

interface ActivityProviderProps {
  children: React.ReactNode
  initialRoom?: string
  initialUsername?: string
}

export function ActivityProvider({ 
  children, 
  initialRoom = '', 
  initialUsername = '' 
}: ActivityProviderProps) {
  // Core state
  const [room, setRoom] = useState(initialRoom)
  const [username, setUsername] = useState(initialUsername)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedDays, setSelectedDays] = useState<30 | 90 | 180 | 360>(360)
  
  // Data state
  const [activities, setActivities] = useState<ActivityData[]>([])
  const [activityPatterns, setActivityPatterns] = useState<ActivityPatterns | null>(null)
  
  // UI state
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  
  // Track current fetch to prevent duplicate requests (React Strict Mode fix)
  const currentFetchKeyRef = useRef<string | null>(null)
  const fetchPromiseRef = useRef<Promise<void> | null>(null)

  // Calculate activity patterns from messages
  const calculatePatterns = useCallback((activities: ActivityData[]): ActivityPatterns | null => {
    const hourCounts: { [hour: number]: number } = {}
    for (let i = 0; i < 24; i++) {
      hourCounts[i] = 0
    }

    let totalMessages = 0 // This will be the REAL total from activity.count
    let sampleMessages = 0 // Messages we have samples for (for hour distribution)
    let daysWithFullData = 0
    let daysWithSampleData = 0
    let daysWithActivity = 0

    activities.forEach(activity => {
      // Add the REAL count (not just sample count)
      totalMessages += activity.count
      
      if (activity.count > 0) {
        daysWithActivity++
      }
      
      if (activity.messages && activity.messages.length > 0) {
        activity.messages.forEach(message => {
          try {
            const date = new Date(parseFloat(message.time) * 1000)
            const hour = date.getHours()
            hourCounts[hour]++
            sampleMessages++
          } catch {
            // Skip invalid timestamps
          }
        })
        
        // Determine if this is full or sample data
        if (activity.count === activity.messages.length) {
          daysWithFullData++
        } else {
          daysWithSampleData++
        }
      }
    })

    if (totalMessages === 0) return null

    // Find peak hours (based on sample distribution, but scaled to total)
    const sortedHours = Object.entries(hourCounts)
      .map(([hour, count]) => ({ 
        hour: parseInt(hour), 
        count, 
        percentage: sampleMessages > 0 ? (count / sampleMessages) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count)

    const peakHour = sortedHours[0]
    const topHours = sortedHours.slice(0, 3).filter(h => h.count > 0)

    return {
      totalMessages, // Now uses the REAL total from activity.count
      peakHour,
      topHours,
      hourCounts,
      daysWithFullData,
      daysWithSampleData,
      isComprehensive: daysWithFullData > daysWithSampleData
    }
  }, [])

  // Fetch activities with database caching (no localStorage)
  // Uses deduplication to prevent React Strict Mode double-fetch issues
  // STREAMING APPROACH: Poll cache while background fetch runs
  const fetchActivities = useCallback(async (forceRefresh = false) => {
    if (!room || !username) {
      return
    }

    // Create a unique key for this fetch request
    const fetchKey = `${room}:${username}:${selectedDays}:${forceRefresh}`
    
    // If we're already fetching for the same parameters, reuse the existing promise
    if (currentFetchKeyRef.current === fetchKey && fetchPromiseRef.current) {
      console.log(`🔄 Reusing existing fetch for ${fetchKey}`)
      return fetchPromiseRef.current
    }

    const today = new Date()
    
    // Generate list of dates we need
    const neededDates: string[] = []
    for (let i = 0; i < selectedDays; i++) {
      const date = subDays(today, i)
      neededDates.push(format(date, 'yyyy-MM-dd'))
    }
    
    console.log(`🌐 Fetching ${neededDates.length} dates from API (database-backed, forceRefresh: ${forceRefresh})`)
    
    setIsLoading(true)
    setProgress({ current: 0, total: neededDates.length })

    // Helper to fetch and update from cache
    const updateFromCache = async () => {
      try {
        const cachedResponse = await fetch('/api/chat-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room,
            username,
            dates: neededDates,
            cacheOnly: true
          })
        })

        if (cachedResponse.ok) {
          const cachedData = await cachedResponse.json()
          if (cachedData.activities && cachedData.activities.length > 0) {
            setActivities(cachedData.activities)
            const patterns = calculatePatterns(cachedData.activities)
            setActivityPatterns(patterns)
            setLastSyncTime(new Date())
            setProgress({ current: cachedData.cachedCount || cachedData.activities.length, total: neededDates.length })
            return cachedData.activities.length
          }
        }
      } catch (err) {
        console.warn('Cache poll failed:', err)
      }
      return 0
    }

    // Create the fetch promise
    const fetchPromise = (async () => {
      let pollingInterval: NodeJS.Timeout | null = null
      
      try {
        // PHASE 1: Get initial cached data (fast)
        if (!forceRefresh) {
          console.log(`📋 Phase 1: Fetching cached data only...`)
          const initialCount = await updateFromCache()
          console.log(`📋 Phase 1 complete: Got ${initialCount} cached activities`)
        }

        // PHASE 2: Start background fetch AND poll for updates
        console.log(`🌐 Phase 2: Starting background fetch with polling...`)
        
        // Start polling every 2 seconds to get newly cached data
        let lastCount = 0
        pollingInterval = setInterval(async () => {
          const newCount = await updateFromCache()
          if (newCount > lastCount) {
            console.log(`🔄 Poll update: ${lastCount} → ${newCount} activities`)
            lastCount = newCount
          }
        }, 2000)

        // Background fetch (this takes a long time)
        const response = await fetch('/api/chat-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room,
            username,
            dates: neededDates,
            forceRefresh
          })
        })

        // Stop polling once main fetch completes
        if (pollingInterval) {
          clearInterval(pollingInterval)
          pollingInterval = null
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.statusText}`)
        }

        const data = await response.json()
        
        if (data.activities) {
          setActivities(data.activities)
          const patterns = calculatePatterns(data.activities)
          setActivityPatterns(patterns)
          setLastSyncTime(new Date())
          
          console.log(`✅ Phase 2 complete: Loaded ${data.activities.length} days (${data.cachedCount || 0} from cache, ${data.fetchedCount || 0} fetched fresh)`)
        }
      } catch (err) {
        console.error('Error fetching activities:', err)
      } finally {
        // Clean up polling interval
        if (pollingInterval) {
          clearInterval(pollingInterval)
        }
        
        setIsLoading(false)
        setProgress({ current: 0, total: 0 })
        
        // Clear the fetch tracking refs
        if (currentFetchKeyRef.current === fetchKey) {
          currentFetchKeyRef.current = null
          fetchPromiseRef.current = null
        }
      }
    })()

    // Store the fetch key and promise for deduplication
    currentFetchKeyRef.current = fetchKey
    fetchPromiseRef.current = fetchPromise

    return fetchPromise
  }, [room, username, selectedDays, calculatePatterns])

  // Refresh activities (force fetch)
  const refreshActivities = useCallback(async () => {
    await fetchActivities(true)
  }, [fetchActivities])

  // Auto-fetch when dependencies change
  useEffect(() => {
    if (room && username) {
      fetchActivities()
    }
  }, [room, username, selectedDays]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({
    room,
    username,
    selectedDate,
    selectedDays,
    activities,
    activityPatterns,
    isLoading,
    progress,
    lastSyncTime,
    setRoom,
    setUsername,
    setSelectedDate,
    setSelectedDays,
    fetchActivities,
    refreshActivities
  }), [
    room,
    username,
    selectedDate,
    selectedDays,
    activities,
    activityPatterns,
    isLoading,
    progress,
    lastSyncTime,
    fetchActivities,
    refreshActivities
  ])

  return (
    <ActivityContext.Provider value={value}>
      {children}
    </ActivityContext.Provider>
  )
}
