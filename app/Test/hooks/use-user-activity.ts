import { useState, useEffect, useCallback } from 'react'
import { getClientCachedActivities } from '@/lib/client-activity-cache'
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

export function useUserActivity(username: string, roomId: string = 'bitcoin_de_DE', days: number = 30) {
  const [activities, setActivities] = useState<ActivityData[]>([])
  const [patterns, setPatterns] = useState<ActivityPatterns | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const calculatePatterns = useCallback((activities: ActivityData[]): ActivityPatterns => {
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
  }, [])

  const fetchActivity = useCallback(async () => {
    if (!username || !roomId) return

    setIsLoading(true)
    setError(null)

    try {
      // Generate dates for the requested period
      const today = new Date()
      const dates: string[] = []
      for (let i = 0; i < days; i++) {
        dates.push(format(subDays(today, i), 'yyyy-MM-dd'))
      }

      // Check localStorage cache first
      const cachedActivities = getClientCachedActivities(roomId, dates, username)
      
      // Convert cached data to ActivityData array
      const cachedActivityData: ActivityData[] = []
      dates.forEach(date => {
        const cached = cachedActivities.get(date)
        if (cached) {
          cachedActivityData.push(cached)
        }
      })

      // If we have all data cached, use it immediately
      if (cachedActivityData.length === dates.length) {
        console.log(`✅ [USE USER ACTIVITY] All ${days} days loaded from localStorage for ${username}`)
        const activityPatterns = calculatePatterns(cachedActivityData)
        setActivities(cachedActivityData)
        setPatterns(activityPatterns)
        setIsLoading(false)
        return
      }

      // Show cached data immediately while loading missing data
      if (cachedActivityData.length > 0) {
        console.log(`📦 [USE USER ACTIVITY] Loaded ${cachedActivityData.length}/${days} days from localStorage for ${username}`)
        const partialPatterns = calculatePatterns(cachedActivityData)
        setActivities(cachedActivityData)
        setPatterns(partialPatterns)
      }

      console.log(`🔍 [USE USER ACTIVITY] Loading all ${days} days for ${username} (will use cache where available)`)
      
      // Fetch from API - it will also check cache on the server
      const response = await fetch('/api/chat-activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          room: roomId,
          username,
          days,
          stream: false // Don't stream for hover cards
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      
      if (data.activities) {
        const activityData = data.activities as ActivityData[]
        const activityPatterns = calculatePatterns(activityData)
        
        setActivities(activityData)
        setPatterns(activityPatterns)
        
        console.log(`✅ [USE USER ACTIVITY] Loaded ${activityData.length} days for ${username}`)
      }
    } catch (err) {
      console.error('❌ [USE USER ACTIVITY] Error fetching activity:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch activity')
    } finally {
      setIsLoading(false)
    }
  }, [username, roomId, days, calculatePatterns])

  useEffect(() => {
    fetchActivity()
  }, [fetchActivity])

  return {
    activities,
    patterns,
    isLoading,
    error,
    refetch: fetchActivity
  }
}

