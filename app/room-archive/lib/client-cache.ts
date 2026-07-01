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

const RANKS_STORAGE_KEY = 'room-archive:top-users:v1'
const RANKS_MAX_AGE_MS = 10 * 60 * 1000

export interface CachedTopUser {
  username: string
  messageCount: number
  user_pic?: string
  is_moderator?: boolean
}

interface TopUsersCacheStore {
  entries: Record<string, { users: CachedTopUser[]; cachedAt: number }>
}

function readRanksStore(): TopUsersCacheStore {
  if (typeof window === 'undefined') return { entries: {} }
  try {
    const raw = sessionStorage.getItem(RANKS_STORAGE_KEY)
    if (!raw) return { entries: {} }
    return JSON.parse(raw) as TopUsersCacheStore
  } catch {
    return { entries: {} }
  }
}

function writeRanksStore(store: TopUsersCacheStore): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(RANKS_STORAGE_KEY, JSON.stringify(store))
  } catch {
    // ignore quota errors
  }
}

export function topUsersCacheKey(
  room: string,
  range: string,
  date: string | null | undefined,
  limit: number
): string {
  return `${room}:${range}:${date || ''}:${limit}`
}

export function readTopUsersCache(key: string): CachedTopUser[] | null {
  const store = readRanksStore()
  const entry = store.entries[key]
  if (!entry) return null
  if (Date.now() - entry.cachedAt > RANKS_MAX_AGE_MS) {
    delete store.entries[key]
    writeRanksStore(store)
    return null
  }
  return entry.users
}

export function writeTopUsersCache(key: string, users: CachedTopUser[]): void {
  const store = readRanksStore()
  store.entries[key] = { users, cachedAt: Date.now() }
  writeRanksStore(store)
}

export function clearTopUsersCache(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(RANKS_STORAGE_KEY)
}
