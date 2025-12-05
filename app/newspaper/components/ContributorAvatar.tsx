/**
 * ContributorAvatar.tsx
 * 
 * Small avatar component for displaying user profile pictures inline with contributor names.
 * Uses AvatarContext for cached avatars, falls back to API fetch if not found.
 */

'use client'

import { useState, useEffect } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAvatarContext } from './AvatarContext'

// Module-level cache for avatars (persists within session)
const avatarCache = new Map<string, string | null>()

// Track pending requests to deduplicate concurrent fetches
const pendingRequests = new Map<string, Promise<string | null>>()

interface ContributorAvatarProps {
  username: string
  size?: 'xs' | 'sm' | 'md'
  showName?: boolean
  className?: string
}

export function ContributorAvatar({ 
  username, 
  size = 'xs', 
  showName = true,
  className = ''
}: ContributorAvatarProps) {
  // Guard against undefined/empty usernames (can happen during streaming)
  const safeUsername = username || ''
  const lowerUsername = safeUsername.toLowerCase()
  
  // Get avatar context (provides avatars from parent components)
  const { getAvatar: getContextAvatar, hasAvatar: hasContextAvatar, addAvatar } = useAvatarContext()
  
  // Check all cache layers for initial state
  const getInitialAvatar = (): string | null => {
    // 1. Check context (populated by sidebar/chatters)
    const contextAvatar = getContextAvatar(safeUsername)
    if (contextAvatar) return contextAvatar
    // 2. Check module cache
    return avatarCache.get(lowerUsername) ?? null
  }
  
  const [avatar, setAvatar] = useState<string | null>(safeUsername ? getInitialAvatar() : null)
  const [isLoading, setIsLoading] = useState(
    safeUsername ? !hasContextAvatar(safeUsername) && !avatarCache.has(lowerUsername) : false
  )

  useEffect(() => {
    // Skip if no username
    if (!safeUsername) {
      setIsLoading(false)
      return
    }

    // 1. Check context first (populated by sidebar chatters fetch)
    const contextAvatar = getContextAvatar(safeUsername)
    if (contextAvatar) {
      setAvatar(contextAvatar)
      setIsLoading(false)
      return
    }
    
    // 2. Check module-level cache
    if (avatarCache.has(lowerUsername)) {
      setAvatar(avatarCache.get(lowerUsername) ?? null)
      setIsLoading(false)
      return
    }

    // 3. Fetch profile to get avatar with request deduplication
    const fetchAvatar = async () => {
      // Check if request already in flight (deduplicate concurrent requests)
      const pending = pendingRequests.get(lowerUsername)
      if (pending) {
        try {
          const result = await pending
          setAvatar(result)
        } catch {
          // Error already handled by original request
        } finally {
          setIsLoading(false)
        }
        return
      }

      // Create new request and track it
      const requestPromise = (async (): Promise<string | null> => {
        try {
          const response = await fetch(`/Test/api/user-profile?username=${encodeURIComponent(safeUsername)}`)
          if (response.ok) {
            const profile = await response.json()
            const avatarUrl = profile?.avatar ?? null
            avatarCache.set(lowerUsername, avatarUrl)
            // Also add to context for other components
            addAvatar(safeUsername, avatarUrl)
            return avatarUrl
          } else {
            avatarCache.set(lowerUsername, null)
            return null
          }
        } catch (err) {
          console.error(`[ContributorAvatar] Failed to fetch avatar for ${safeUsername}:`, err)
          avatarCache.set(lowerUsername, null)
          return null
        }
      })()

      pendingRequests.set(lowerUsername, requestPromise)

      try {
        const result = await requestPromise
        setAvatar(result)
      } finally {
        pendingRequests.delete(lowerUsername)
        setIsLoading(false)
      }
    }

    fetchAvatar()
  }, [safeUsername, lowerUsername, getContextAvatar, addAvatar])

  const sizeClasses = {
    xs: 'h-4 w-4',
    sm: 'h-5 w-5',
    md: 'h-6 w-6'
  }

  const textClasses = {
    xs: 'text-[8px]',
    sm: 'text-[9px]',
    md: 'text-[10px]'
  }

  // Don't render anything if no username
  if (!safeUsername) {
    return null
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <Avatar className={`${sizeClasses[size]} border border-foreground/10`}>
        <AvatarImage 
          src={avatar ?? undefined} 
          alt={safeUsername}
          className="object-cover"
        />
        <AvatarFallback className={`${textClasses[size]} font-semibold bg-muted`}>
          {isLoading ? (
            <span className="animate-pulse">•</span>
          ) : (
            safeUsername.slice(0, 1).toUpperCase()
          )}
        </AvatarFallback>
      </Avatar>
      {showName && <span>@{safeUsername}</span>}
    </span>
  )
}

/**
 * Batch prefetch avatars for multiple users
 * Call this to warm the cache before rendering
 * Uses lowercase keys for consistency with ContributorAvatar component
 */
export function prefetchAvatars(usernames: string[]) {
  usernames.forEach(username => {
    if (!username) return // Skip undefined/null usernames
    const lowerUsername = username.toLowerCase()
    
    // Skip if already cached or request in flight
    if (avatarCache.has(lowerUsername) || pendingRequests.has(lowerUsername)) {
      return
    }

    const requestPromise = (async (): Promise<string | null> => {
      try {
        const response = await fetch(`/Test/api/user-profile?username=${encodeURIComponent(username)}`)
        if (response.ok) {
          const profile = await response.json()
          const avatarUrl = profile?.avatar ?? null
          avatarCache.set(lowerUsername, avatarUrl)
          return avatarUrl
        }
        avatarCache.set(lowerUsername, null)
        return null
      } catch {
        avatarCache.set(lowerUsername, null)
        return null
      }
    })()

    pendingRequests.set(lowerUsername, requestPromise)
    requestPromise.finally(() => pendingRequests.delete(lowerUsername))
  })
}

