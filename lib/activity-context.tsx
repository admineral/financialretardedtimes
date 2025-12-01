'use client'

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
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
  
  // Abort controller for canceling requests
  const abortControllerRef = React.useRef<AbortController | null>(null)

  // Calculate activity patterns from messages
  const calculatePatterns = useCallback((activities: ActivityData[]): ActivityPatterns | null => {
    const hourCounts: { [hour: number]: number } = {}
    for (let i = 0; i < 24; i++) {
      hourCounts[i] = 0
    }

    let totalMessages = 0
    let daysWithFullData = 0
    let daysWithSampleData = 0

    activities.forEach(activity => {
      if (activity.messages && activity.messages.length > 0) {
        activity.messages.forEach(message => {
          try {
            const date = new Date(parseFloat(message.time) * 1000)
            const hour = date.getHours()
            hourCounts[hour]++
            totalMessages++
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

    // Find peak hours
    const sortedHours = Object.entries(hourCounts)
      .map(([hour, count]) => ({ 
        hour: parseInt(hour), 
        count, 
        percentage: (count / totalMessages) * 100 
      }))
      .sort((a, b) => b.count - a.count)

    const peakHour = sortedHours[0]
    const topHours = sortedHours.slice(0, 3).filter(h => h.count > 0)

    return {
      totalMessages,
      peakHour,
      topHours,
      hourCounts,
      daysWithFullData,
      daysWithSampleData,
      isComprehensive: daysWithFullData > daysWithSampleData
    }
  }, [])

  // Fetch activities with database caching (no localStorage)
  const fetchActivities = useCallback(async (forceRefresh = false) => {
    if (!room || !username) {
      return
    }

    // Abort any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new abort controller
    const abortController = new AbortController()
    abortControllerRef.current = abortController

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

    try {
      const response = await fetch('/api/chat-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room,
          username,
          dates: neededDates,
          forceRefresh
        }),
        signal: abortController.signal
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`)
      }

      const data = await response.json()
      
      if (data.activities) {
        setActivities(data.activities)
        const patterns = calculatePatterns(data.activities)
        setActivityPatterns(patterns)
        setLastSyncTime(new Date())
        
        console.log(`✅ Loaded ${data.activities.length} days (${data.cachedCount || 0} from cache, ${data.fetchedCount || 0} fetched fresh)`)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Fetch aborted')
      } else {
        console.error('Error fetching activities:', err)
      }
    } finally {
      if (!abortController.signal.aborted) {
        setIsLoading(false)
        setProgress({ current: 0, total: 0 })
      }
      
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null
      }
    }
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

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
