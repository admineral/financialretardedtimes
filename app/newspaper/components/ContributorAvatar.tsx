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
  const [avatar, setAvatar] = useState<string | null>(avatarCache.get(username) ?? null)
  const [isLoading, setIsLoading] = useState(!avatarCache.has(username))

  useEffect(() => {
    // Skip if already cached
    if (avatarCache.has(username)) {
      setAvatar(avatarCache.get(username) ?? null)
      setIsLoading(false)
      return
    }

    // Fetch profile to get avatar
    const fetchAvatar = async () => {
      try {
        const response = await fetch(`/Test/api/user-profile?username=${encodeURIComponent(username)}`)
        if (response.ok) {
          const profile = await response.json()
          const avatarUrl = profile?.avatar ?? null
          avatarCache.set(username, avatarUrl)
          setAvatar(avatarUrl)
        } else {
          avatarCache.set(username, null)
        }
      } catch (err) {
        console.error(`[ContributorAvatar] Failed to fetch avatar for ${username}:`, err)
        avatarCache.set(username, null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchAvatar()
  }, [username])

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

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <Avatar className={`${sizeClasses[size]} border border-foreground/10`}>
        <AvatarImage 
          src={avatar ?? undefined} 
          alt={username}
          className="object-cover"
        />
        <AvatarFallback className={`${textClasses[size]} font-semibold bg-muted`}>
          {isLoading ? (
            <span className="animate-pulse">•</span>
          ) : (
            username.slice(0, 1).toUpperCase()
          )}
        </AvatarFallback>
      </Avatar>
      {showName && <span>@{username}</span>}
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

