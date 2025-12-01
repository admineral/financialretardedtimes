'use client'

/**
 * Client-side localStorage cache for activity data
 * This allows us to cache data in the user's browser to avoid flickering
 * and reduce unnecessary API calls
 */

import { isToday, parseISO } from 'date-fns'

export interface CachedActivityData {
  date: string
  count: number
  messages?: Array<{
    id: string
    text: string
    time: string
  }>
}

export interface ActivityCacheEntry {
  date: string
  room: string
  username: string
  count: number
  messages: Array<{
    id: string
    text: string
    time: string
  }>
  cachedAt: string
}

const CACHE_PREFIX = 'tv_activity_'
const CACHE_EXPIRY_MINUTES = 15 // Cache expires after 15 minutes for today
const MAX_CACHE_SIZE = 5000 // Maximum number of cache entries to keep (30 days × 100 users = 3000)

/**
 * Generate cache key for a specific date/room/username
 */
function getCacheKey(room: string, date: string, username: string): string {
  return `${CACHE_PREFIX}${room}_${username}_${date}`
}

/**
 * Check if cached data is still fresh
 */
function isCacheFresh(cachedAt: string, date: string): boolean {
  try {
    const dateObj = parseISO(date)
    if (!isToday(dateObj)) {
      return true // Old dates are always fresh (permanent cache)
    }
    
    // For today, check if cache is less than 15 minutes old
    const cacheTime = new Date(cachedAt)
    const now = new Date()
    const diffMinutes = (now.getTime() - cacheTime.getTime()) / (1000 * 60)
    return diffMinutes < CACHE_EXPIRY_MINUTES
  } catch {
    return false
  }
}

/**
 * Get cached activity data from localStorage
 */
export function getClientCachedActivity(
  room: string,
  date: string,
  username: string
): CachedActivityData | null {
  if (typeof window === 'undefined') return null
  
  try {
    const cacheKey = getCacheKey(room, date, username)
    const cached = localStorage.getItem(cacheKey)
    
    if (!cached) {
      return null
    }
    
    const entry: ActivityCacheEntry = JSON.parse(cached)
    
    // Verify the cached data matches our request
    if (entry.room === room && entry.date === date && entry.username === username) {
      // Check if cache is still fresh
      if (isCacheFresh(entry.cachedAt, date)) {
        return {
          date: entry.date,
          count: entry.count,
          messages: entry.messages
        }
      }
    }
    
    // Cache is stale, remove it
    localStorage.removeItem(cacheKey)
    return null
  } catch (error) {
    console.warn('Failed to read from localStorage cache:', error)
    return null
  }
}

/**
 * Save activity data to localStorage cache
 */
export function setClientCachedActivity(
  room: string,
  date: string,
  username: string,
  count: number,
  messages: Array<{ id: string; text: string; time: string; avatar?: string }>
): void {
  if (typeof window === 'undefined') return
  
  try {
    const cacheKey = getCacheKey(room, date, username)
    
    // Remove avatar from messages before caching (saves space)
    const messagesWithoutAvatar = messages.map(({ id, text, time }) => ({ id, text, time }))
    
    const entry: ActivityCacheEntry = {
      date,
      room,
      username,
      count,
      messages: messagesWithoutAvatar,
      cachedAt: new Date().toISOString()
    }
    
    localStorage.setItem(cacheKey, JSON.stringify(entry))
    
    // Cleanup old cache entries if we have too many
    cleanupOldCacheEntries()
  } catch (error) {
    console.warn('Failed to write to localStorage cache:', error)
  }
}

/**
 * Get multiple cached activities at once
 */
export function getClientCachedActivities(
  room: string,
  dates: string[],
  username: string
): Map<string, CachedActivityData> {
  const cached = new Map<string, CachedActivityData>()
  
  for (const date of dates) {
    const data = getClientCachedActivity(room, date, username)
    if (data) {
      cached.set(date, data)
    }
  }
  
  return cached
}

/**
 * Check which dates are available in cache
 */
export function getAvailableCachedDates(
  room: string,
  dates: string[],
  username: string
): string[] {
  const available: string[] = []
  
  for (const date of dates) {
    if (getClientCachedActivity(room, date, username)) {
      available.push(date)
    }
  }
  
  return available
}

/**
 * Cleanup old cache entries to prevent localStorage from growing too large
 */
function cleanupOldCacheEntries(): void {
  if (typeof window === 'undefined') return
  
  try {
    // Get all cache keys
    const cacheKeys: Array<{ key: string; time: number }> = []
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(CACHE_PREFIX)) {
        try {
          const cached = localStorage.getItem(key)
          if (cached) {
            const entry: ActivityCacheEntry = JSON.parse(cached)
            const time = new Date(entry.cachedAt).getTime()
            cacheKeys.push({ key, time })
          }
        } catch {
          // Invalid entry, will be cleaned up
          localStorage.removeItem(key)
        }
      }
    }
    
    // If we have too many entries, remove the oldest ones
    if (cacheKeys.length > MAX_CACHE_SIZE) {
      // Sort by time (oldest first)
      cacheKeys.sort((a, b) => a.time - b.time)
      
      // Remove oldest entries
      const toRemove = cacheKeys.length - MAX_CACHE_SIZE
      for (let i = 0; i < toRemove; i++) {
        localStorage.removeItem(cacheKeys[i].key)
      }
    }
  } catch (error) {
    console.warn('Failed to cleanup localStorage cache:', error)
  }
}

/**
 * Clear all cached activity data for a specific user/room
 */
export function clearClientActivityCache(room: string, username: string): void {
  if (typeof window === 'undefined') return
  
  try {
    const keysToRemove: string[] = []
    const prefix = `${CACHE_PREFIX}${room}_${username}_`
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key)
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key))
  } catch (error) {
    console.warn('Failed to clear localStorage cache:', error)
  }
}

/**
 * Get cache statistics
 */
export function getClientCacheStats(): {
  totalEntries: number
  totalSize: number
} {
  if (typeof window === 'undefined') return { totalEntries: 0, totalSize: 0 }
  
  try {
    let totalEntries = 0
    let totalSize = 0
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(CACHE_PREFIX)) {
        totalEntries++
        const value = localStorage.getItem(key)
        if (value) {
          totalSize += key.length + value.length
        }
      }
    }
    
    return { totalEntries, totalSize }
  } catch (error) {
    console.warn('Failed to get cache stats:', error)
    return { totalEntries: 0, totalSize: 0 }
  }
}

/**
 * Get cache progress for a user (how many days are cached)
 */
export function getCacheProgress(
  room: string,
  username: string,
  totalDays: number = 365
): {
  cachedDays: number
  totalDays: number
  percentage: number
} {
  if (typeof window === 'undefined') return { cachedDays: 0, totalDays, percentage: 0 }
  
  try {
    let cachedDays = 0
    const prefix = `${CACHE_PREFIX}${room}_${username}_`
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(prefix)) {
        cachedDays++
      }
    }
    
    const percentage = totalDays > 0 ? Math.round((cachedDays / totalDays) * 100) : 0
    
    return { cachedDays, totalDays, percentage }
  } catch (error) {
    console.warn('Failed to get cache progress:', error)
    return { cachedDays: 0, totalDays, percentage: 0 }
  }
}

