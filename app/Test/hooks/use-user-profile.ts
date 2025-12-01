import { useState, useEffect, useCallback } from 'react'
import { TradingViewUserProfile } from '../types'

// In-memory cache for user profiles
const profileCache = new Map<string, {
  data: TradingViewUserProfile
  timestamp: number
  expiry: number
}>()

const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
const LOCALSTORAGE_CACHE_DURATION = 60 * 60 * 1000 // 1 hour for localStorage
const PROFILE_CACHE_PREFIX = 'tv_profile_'

// Clean up expired cache entries periodically
const cleanupCache = () => {
  const now = Date.now()
  for (const [key, value] of profileCache.entries()) {
    if (now >= value.expiry) {
      profileCache.delete(key)
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupCache, 10 * 60 * 1000)

// localStorage helper functions
function getLocalStorageCacheKey(cacheKey: string): string {
  return `${PROFILE_CACHE_PREFIX}${cacheKey}`
}

function getProfileFromLocalStorage(cacheKey: string): TradingViewUserProfile | null {
  if (typeof window === 'undefined') return null
  
  try {
    const localKey = getLocalStorageCacheKey(cacheKey)
    const cached = localStorage.getItem(localKey)
    
    if (!cached) {
      console.log(`[PROFILE] localStorage miss for ${cacheKey}`)
      return null
    }
    
    const entry = JSON.parse(cached)
    const now = Date.now()
    
    // Check if still fresh
    if (now < entry.expiry) {
      console.log(`✅ [PROFILE] localStorage hit for ${cacheKey}`, {
        followers: entry.data.followers,
        ideas: entry.data.ideas,
        age: Math.round((now - entry.timestamp) / 1000 / 60) + ' minutes'
      })
      return entry.data
    }
    
    // Expired, remove it
    console.log(`[PROFILE] localStorage expired for ${cacheKey}, removing`)
    localStorage.removeItem(localKey)
    return null
  } catch (error) {
    console.warn('[PROFILE] Failed to read from localStorage:', error)
    return null
  }
}

function saveProfileToLocalStorage(cacheKey: string, data: TradingViewUserProfile): void {
  if (typeof window === 'undefined') return
  
  try {
    const localKey = getLocalStorageCacheKey(cacheKey)
    const now = Date.now()
    const entry = {
      data,
      timestamp: now,
      expiry: now + LOCALSTORAGE_CACHE_DURATION
    }
    
    console.log(`💾 [PROFILE] Saving to localStorage for ${cacheKey}`, {
      followers: data.followers,
      ideas: data.ideas
    })
    
    localStorage.setItem(localKey, JSON.stringify(entry))
  } catch (error) {
    console.warn('[PROFILE] Failed to write to localStorage:', error)
  }
}

interface UseUserProfileResult {
  profile: TradingViewUserProfile | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

interface UseUserProfileOptions {
  userId?: string | number | null
  username?: string | null
}

export function useUserProfile(options: UseUserProfileOptions | string | number | null): UseUserProfileResult {
  const [profile, setProfile] = useState<TradingViewUserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Handle both old and new API
  const { userId, username } = typeof options === 'object' && options !== null 
    ? options 
    : { userId: options, username: null }

  const fetchProfile = useCallback(async () => {
    if (!userId && !username) {
      setProfile(null)
      setError(null)
      return
    }

    // Create cache key
    const cacheKey = userId ? `id:${userId}` : `name:${username}`
    
    // Check in-memory cache first (fastest)
    const cached = profileCache.get(cacheKey)
    const now = Date.now()
    
    if (cached && now < cached.expiry) {
      console.log('✅ [USE USER PROFILE] Using in-memory cached profile for:', cacheKey)
      setProfile(cached.data)
      setError(null)
      setIsLoading(false)
      return
    }

    // Check localStorage cache (persists across refreshes)
    const localCached = getProfileFromLocalStorage(cacheKey)
    if (localCached) {
      console.log('✅ [USE USER PROFILE] Using localStorage cached profile for:', cacheKey)
      setProfile(localCached)
      setError(null)
      setIsLoading(false)
      
      // Also update in-memory cache
      profileCache.set(cacheKey, {
        data: localCached,
        timestamp: now,
        expiry: now + CACHE_DURATION
      })
      
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      console.log('🔍 [USE USER PROFILE] Fetching profile from API for:', { userId, username })
      
      const params = new URLSearchParams()
      if (userId) params.append('userId', String(userId))
      if (username) params.append('username', username)
      
      const response = await fetch(`/Test/api/user-profile?${params.toString()}`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const profileData = await response.json()
      
      // Don't treat "Profile not accessible" as an error - just use limited data
      if (profileData.error && !profileData.error.includes('Profile not accessible')) {
        throw new Error(profileData.error)
      }

      console.log('✅ [USE USER PROFILE] Successfully fetched profile from API:', profileData)
      
      // Cache in both memory and localStorage
      profileCache.set(cacheKey, {
        data: profileData,
        timestamp: now,
        expiry: now + CACHE_DURATION
      })
      
      saveProfileToLocalStorage(cacheKey, profileData)
      
      setProfile(profileData)
      
    } catch (err) {
      console.error('❌ [USE USER PROFILE] Error fetching profile:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch profile')
      setProfile(null)
    } finally {
      setIsLoading(false)
    }
  }, [userId, username])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const refetch = () => {
    fetchProfile()
  }

  return {
    profile,
    isLoading,
    error,
    refetch
  }
}
