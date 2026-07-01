'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DateStats } from '@/app/newspaper/lib/types'
import {
  readTimelineStatsCache,
  writeTimelineStatsCache,
  clearTimelineStatsCache
} from '../lib/client-cache'

interface SyncStatus {
  last_sync_at: string
  total_messages: number
  is_full_history: boolean
  newest_message_time: string | null
}

export interface ArchiveStatsPayload {
  dates: DateStats[]
  totalMessages: number
  totalDays: number
  maxDailyMessages: number
  cumulativeUsers: Record<number, number>
  syncStatus: SyncStatus | null
  isFromCache: boolean
  cacheState?: string
}

const DEFAULT_ROOM = 'bitcoin_de_DE'

function hydrateFromCache(): ArchiveStatsPayload | null {
  const cached = readTimelineStatsCache()
  if (!cached) return null
  return {
    dates: cached.dates,
    totalMessages: cached.totalMessages,
    totalDays: cached.totalDays,
    maxDailyMessages: cached.maxDailyMessages,
    cumulativeUsers: cached.cumulativeUsers,
    syncStatus: null,
    isFromCache: true,
    cacheState: 'client'
  }
}

export function useArchiveStats(roomId = DEFAULT_ROOM) {
  const initialCache = useMemo(() => hydrateFromCache(), [])
  const hasHydrated = useRef(Boolean(initialCache))
  const [data, setData] = useState<ArchiveStatsPayload | null>(initialCache)
  const [isLoading, setIsLoading] = useState(!initialCache)
  const [isRevalidating, setIsRevalidating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(
    async (refresh = false) => {
      if (refresh) clearTimelineStatsCache()

      setIsRevalidating(hasHydrated.current)
      if (!hasHydrated.current) setIsLoading(true)

      try {
        const response = await fetch(
          `/room-archive/api/stats?room=${roomId}${refresh ? '&refresh=true' : ''}`,
          { cache: refresh ? 'no-store' : 'default' }
        )
        if (!response.ok) throw new Error('Failed to load stats')

        const json = await response.json()
        const payload: ArchiveStatsPayload = {
          dates: json.dates || [],
          totalMessages: json.totalMessages || 0,
          totalDays: json.totalDays || 0,
          maxDailyMessages: json.maxDailyMessages || 0,
          cumulativeUsers: json.cumulativeUsers || {},
          syncStatus: json.syncStatus || null,
          isFromCache: json.isFromCache ?? false,
          cacheState: json.cacheState
        }

        setData(payload)
        setError(null)
        hasHydrated.current = true

        writeTimelineStatsCache({
          dates: payload.dates,
          totalMessages: payload.totalMessages,
          totalDays: payload.totalDays,
          maxDailyMessages: payload.maxDailyMessages,
          cumulativeUsers: payload.cumulativeUsers
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setIsLoading(false)
        setIsRevalidating(false)
      }
    },
    [roomId]
  )

  useEffect(() => {
    void fetchStats(false)
  }, [fetchStats])

  return {
    data,
    isLoading,
    isRevalidating,
    error,
    refresh: () => fetchStats(true)
  }
}
