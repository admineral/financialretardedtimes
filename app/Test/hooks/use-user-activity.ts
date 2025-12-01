import { useState, useEffect, useCallback } from 'react'
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

      console.log(`🔍 [USE USER ACTIVITY] Loading ${days} days for ${username} (database-backed)`)
      
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
        
        setActivities(activityData)
        setPatterns(activityPatterns)
        
        console.log(`✅ [USE USER ACTIVITY] Loaded ${activityData.length} days for ${username} (${data.cachedCount || 0} cached, ${data.fetchedCount || 0} fetched)`)
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
