'use client'

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
import { format, subDays } from 'date-fns'
import {
  getClientCachedActivity,
  setClientCachedActivity
} from './client-activity-cache'

interface ActivityData {
  date: string // YYYY-MM-DD format
  count: number
  messages?: Array<{
    id: string
    text: string
    time: string
    avatar?: string
  }>
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

  // Fetch activities with smart caching
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
    
    // ALWAYS load from localStorage first (even on forceRefresh)
    // This ensures we resume from where we left off if we aborted mid-fetch
    const cachedActivities: ActivityData[] = []
    const cachedDatesSet = new Set<string>()
    
    neededDates.forEach(date => {
      const cached = getClientCachedActivity(room, date, username)
      if (cached) {
        cachedActivities.push({
          date: cached.date,
          count: cached.count,
          messages: cached.messages
        })
        cachedDatesSet.add(date)
      }
    })
    
    // Show cached data immediately (no flicker!)
    if (cachedActivities.length > 0) {
      console.log(`📦 Loaded ${cachedActivities.length} dates from localStorage cache`)
      setActivities(cachedActivities)
      const patterns = calculatePatterns(cachedActivities)
      setActivityPatterns(patterns)
    }
    
    // Determine which dates need to be fetched
    // On forceRefresh, we refetch all dates, but we still use cache as a base
    const datesToFetch = forceRefresh ? neededDates : neededDates.filter(date => !cachedDatesSet.has(date))
    
    if (datesToFetch.length === 0) {
      console.log('✅ All data available in localStorage - no fetch needed')
      setLastSyncTime(new Date())
      return
    }
    
    console.log(`🌐 Fetching ${datesToFetch.length}/${neededDates.length} dates from API (forceRefresh: ${forceRefresh}, resuming from ${cachedActivities.length} cached)`)
    
    setIsLoading(true)
    setProgress({ current: 0, total: datesToFetch.length })

    try {
      const response = await fetch('/api/chat-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room,
          username,
          dates: datesToFetch, // Send specific dates to fetch, not day count
          stream: true
        }),
        signal: abortController.signal
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`)
      }

      const contentType = response.headers.get('content-type')
      
      if (contentType?.includes('application/json')) {
        // Non-streaming response
        const data = await response.json()
        
        // Cache all activities
        data.activities.forEach((activity: ActivityData) => {
          setClientCachedActivity(room, activity.date, username, activity.count, activity.messages || [])
        })
        
        setActivities(data.activities)
        const patterns = calculatePatterns(data.activities)
        setActivityPatterns(patterns)
        setLastSyncTime(new Date())
      } else {
        // Streaming response
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        const streamedActivities: ActivityData[] = []
        const streamedDatesSet = new Set<string>()

        if (reader) {
          while (true) {
            if (abortController.signal.aborted) {
              reader.cancel()
              break
            }

            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (line.trim() === '') continue
              
              try {
                const chunk = JSON.parse(line)
                
                if (chunk.type === 'progress') {
                  setProgress({ 
                    current: chunk.current || 0, 
                    total: datesToFetch.length 
                  })
                } else if (chunk.type === 'activity') {
                  const activity = chunk.activity
                  
                  // Cache immediately
                  setClientCachedActivity(room, activity.date, username, activity.count, activity.messages || [])
                  
                  // Track streamed dates to avoid duplicates
                  if (!streamedDatesSet.has(activity.date)) {
                    streamedActivities.push(activity)
                    streamedDatesSet.add(activity.date)
                  }
                  
                  // Merge: Keep cached data for dates we haven't streamed yet
                  // Replace with streamed data for dates we have received
                  const mergedActivities = [
                    ...cachedActivities.filter(a => !streamedDatesSet.has(a.date)),
                    ...streamedActivities
                  ]
                  
                  setActivities(mergedActivities)
                  
                  // Update patterns with merged data
                  const patterns = calculatePatterns(mergedActivities)
                  setActivityPatterns(patterns)
                } else if (chunk.type === 'complete') {
                  setLastSyncTime(new Date())
                }
              } catch (err) {
                console.warn('Failed to parse chunk:', err)
              }
            }
          }
        }
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

