import { useState, useEffect, useCallback, useRef } from 'react'
import { TradingViewUserProfile } from '../types'

// In-memory cache for user profiles (persists across component remounts)
const profileCache = new Map<string, {
  data: TradingViewUserProfile
  timestamp: number
  expiry: number
}>()

// Track pending requests to deduplicate
const pendingRequests = new Map<string, Promise<TradingViewUserProfile | null>>()

const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

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

/**
 * Hook to fetch user profile data
 * 
 * OPTIMIZED:
 * - Module-level cache persists across remounts
 * - Request deduplication prevents duplicate API calls
 * - Only fetches when component is mounted
 */
export function useUserProfile(options: UseUserProfileOptions | string | number | null): UseUserProfileResult {
  const [profile, setProfile] = useState<TradingViewUserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  // Handle both old and new API
  const { userId, username } = typeof options === 'object' && options !== null 
    ? options 
    : { userId: options, username: null }

  const fetchProfile = useCallback(async () => {
    const identifier = username || (userId ? String(userId) : null)
    if (!identifier) {
      setProfile(null)
      setError(null)
      return
    }

    const cacheKey = username ? `name:${username.toLowerCase()}` : `id:${userId}`
    const now = Date.now()

    // 1. Check memory cache first
    const cached = profileCache.get(cacheKey)
    if (cached && now < cached.expiry) {
      if (mountedRef.current) {
        setProfile(cached.data)
        setIsLoading(false)
      }
      return
    }

    // 2. Check if request already in flight (deduplication)
    const pending = pendingRequests.get(cacheKey)
    if (pending) {
      try {
        const result = await pending
        if (mountedRef.current) {
          setProfile(result)
          setIsLoading(false)
        }
      } catch {
        if (mountedRef.current) {
          setIsLoading(false)
        }
      }
      return
    }

    // 3. Make new request
    if (mountedRef.current) {
      setIsLoading(true)
      setError(null)
    }

    const requestPromise = (async (): Promise<TradingViewUserProfile | null> => {
      try {
        const params = new URLSearchParams()
        if (userId) params.append('userId', String(userId))
        if (username) params.append('username', username)
        
        const response = await fetch(`/Test/api/user-profile?${params.toString()}`)
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const profileData = await response.json()
        
        if (profileData.error && !profileData.error.includes('Profile not accessible')) {
          throw new Error(profileData.error)
        }

        // Cache the result
        profileCache.set(cacheKey, {
          data: profileData,
          timestamp: now,
          expiry: now + CACHE_DURATION
        })

        return profileData
      } catch (err) {
        console.error('[useUserProfile] Error:', err)
        throw err
      }
    })()

    pendingRequests.set(cacheKey, requestPromise)

    try {
      const result = await requestPromise
      if (mountedRef.current) {
        setProfile(result)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch profile')
        setProfile(null)
      }
    } finally {
      pendingRequests.delete(cacheKey)
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [userId, username])

  useEffect(() => {
    mountedRef.current = true
    fetchProfile()
    
    return () => {
      mountedRef.current = false
    }
  }, [fetchProfile])

  return {
    profile,
    isLoading,
    error,
    refetch: fetchProfile
  }
}
