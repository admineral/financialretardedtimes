/**
 * Browser-side cache for room archive timeline counts (sessionStorage).
 */

import type { DateStats } from '@/app/newspaper/lib/types'

const STORAGE_KEY = 'room-archive:timeline-stats:v1'
const MAX_AGE_MS = 30 * 60 * 1000

export interface CachedTimelineStats {
  dates: DateStats[]
  totalMessages: number
  totalDays: number
  maxDailyMessages: number
  cumulativeUsers: Record<number, number>
  cachedAt: number
}

export function readTimelineStatsCache(): CachedTimelineStats | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedTimelineStats
    if (Date.now() - parsed.cachedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeTimelineStatsCache(data: Omit<CachedTimelineStats, 'cachedAt'>): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...data, cachedAt: Date.now() })
    )
  } catch {
    // ignore quota errors
  }
}

export function clearTimelineStatsCache(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(STORAGE_KEY)
}
