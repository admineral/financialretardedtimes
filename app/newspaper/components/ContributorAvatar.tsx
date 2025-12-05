/**
 * ContributorAvatar.tsx
 * 
 * Small avatar component for displaying user profile pictures inline with contributor names.
 * Fetches avatar from profile API and caches it locally.
 */

'use client'

import { useState, useEffect } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

// Local cache for avatars to prevent redundant fetches
const avatarCache = new Map<string, string | null>()

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
  
  const [avatar, setAvatar] = useState<string | null>(safeUsername ? (avatarCache.get(safeUsername) ?? null) : null)
  const [isLoading, setIsLoading] = useState(safeUsername ? !avatarCache.has(safeUsername) : false)

  useEffect(() => {
    // Skip if no username or already cached
    if (!safeUsername || avatarCache.has(safeUsername)) {
      if (safeUsername) {
        setAvatar(avatarCache.get(safeUsername) ?? null)
      }
      setIsLoading(false)
      return
    }

    // Fetch profile to get avatar
    const fetchAvatar = async () => {
      try {
        const response = await fetch(`/Test/api/user-profile?username=${encodeURIComponent(safeUsername)}`)
        if (response.ok) {
          const profile = await response.json()
          const avatarUrl = profile?.avatar ?? null
          avatarCache.set(safeUsername, avatarUrl)
          setAvatar(avatarUrl)
        } else {
          avatarCache.set(safeUsername, null)
        }
      } catch (err) {
        console.error(`[ContributorAvatar] Failed to fetch avatar for ${safeUsername}:`, err)
        avatarCache.set(safeUsername, null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchAvatar()
  }, [safeUsername])

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
 */
export function prefetchAvatars(usernames: string[]) {
  usernames.forEach(username => {
    if (!avatarCache.has(username)) {
      fetch(`/Test/api/user-profile?username=${encodeURIComponent(username)}`)
        .then(res => res.ok ? res.json() : null)
        .then(profile => {
          avatarCache.set(username, profile?.avatar ?? null)
        })
        .catch(() => {
          avatarCache.set(username, null)
        })
    }
  })
}

