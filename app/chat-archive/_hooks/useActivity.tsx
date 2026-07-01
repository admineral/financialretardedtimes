'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { format, subDays } from 'date-fns'
import { getActivity } from '../_lib/api'
import { calculatePatterns } from '../_lib/patterns'
import { DEFAULT_WINDOW } from '../_lib/rooms'
import type { ActivityData, ActivityPatterns, ActivityWindow } from '../_lib/types'

interface ActivityContextValue {
  room: string
  username: string
  windowDays: ActivityWindow
  selectedDate: Date
  activities: ActivityData[]
  patterns: ActivityPatterns | null
  isLoading: boolean
  progress: { current: number; total: number }
  lastSyncTime: Date | null
  setWindowDays: (days: ActivityWindow) => void
  setSelectedDate: (date: Date) => void
  refresh: () => Promise<void>
  clearLocal: () => void
}

const ActivityContext = createContext<ActivityContextValue | undefined>(undefined)

export function useActivity(): ActivityContextValue {
  const ctx = useContext(ActivityContext)
  if (!ctx) throw new Error('useActivity must be used within ActivityProvider')
  return ctx
}

interface ActivityProviderProps {
  room: string
  username: string
  children: React.ReactNode
}

const POLL_INTERVAL_MS = 2000

export function ActivityProvider({ room, username, children }: ActivityProviderProps) {
  const [windowDays, setWindowDays] = useState<ActivityWindow>(DEFAULT_WINDOW)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [activities, setActivities] = useState<ActivityData[]>([])
  const [patterns, setPatterns] = useState<ActivityPatterns | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)

  // Deduplicate concurrent fetches (React Strict Mode double-invoke safe).
  const fetchKeyRef = useRef<string | null>(null)
  const fetchPromiseRef = useRef<Promise<void> | null>(null)

  const applyActivities = useCallback((next: ActivityData[]) => {
    setActivities(next)
    setPatterns(calculatePatterns(next))
    setLastSyncTime(new Date())
  }, [])

  const fetchActivities = useCallback(
    async (forceRefresh = false) => {
      if (!room || !username) return

      const key = `${room}:${username}:${windowDays}:${forceRefresh}`
      if (fetchKeyRef.current === key && fetchPromiseRef.current) {
        return fetchPromiseRef.current
      }

      const today = new Date()
      const dates: string[] = []
      for (let i = 0; i < windowDays; i++) {
        dates.push(format(subDays(today, i), 'yyyy-MM-dd'))
      }

      setIsLoading(true)
      setProgress({ current: 0, total: dates.length })

      const pollCache = async (): Promise<number> => {
        try {
          const cached = await getActivity({ room, username, dates, cacheOnly: true })
          if (cached.activities?.length) {
            applyActivities(cached.activities)
            setProgress({
              current: cached.cachedCount ?? cached.activities.length,
              total: dates.length,
            })
            return cached.activities.length
          }
        } catch {
          // Cache poll failures are non-fatal.
        }
        return 0
      }

      const run = (async () => {
        let poll: ReturnType<typeof setInterval> | null = null
        try {
          if (!forceRefresh) {
            await pollCache()
          }

          let lastCount = 0
          poll = setInterval(async () => {
            const count = await pollCache()
            if (count > lastCount) lastCount = count
          }, POLL_INTERVAL_MS)

          const data = await getActivity({ room, username, dates, forceRefresh })
          if (poll) {
            clearInterval(poll)
            poll = null
          }
          if (data.activities) applyActivities(data.activities)
        } catch (err) {
          console.error('Failed to load activity:', err)
        } finally {
          if (poll) clearInterval(poll)
          setIsLoading(false)
          setProgress({ current: 0, total: 0 })
          if (fetchKeyRef.current === key) {
            fetchKeyRef.current = null
            fetchPromiseRef.current = null
          }
        }
      })()

      fetchKeyRef.current = key
      fetchPromiseRef.current = run
      return run
    },
    [room, username, windowDays, applyActivities]
  )

  const refresh = useCallback(() => fetchActivities(true), [fetchActivities])

  const clearLocal = useCallback(() => {
    setActivities([])
    setPatterns(null)
    setLastSyncTime(null)
    setProgress({ current: 0, total: 0 })
  }, [])

  useEffect(() => {
    void fetchActivities()
  }, [fetchActivities])

  const value = useMemo<ActivityContextValue>(
    () => ({
      room,
      username,
      windowDays,
      selectedDate,
      activities,
      patterns,
      isLoading,
      progress,
      lastSyncTime,
      setWindowDays,
      setSelectedDate,
      refresh,
      clearLocal,
    }),
    [
      room,
      username,
      windowDays,
      selectedDate,
      activities,
      patterns,
      isLoading,
      progress,
      lastSyncTime,
      refresh,
      clearLocal,
    ]
  )

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>
}
