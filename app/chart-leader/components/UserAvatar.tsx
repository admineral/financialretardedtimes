'use client'

import { useState, useEffect } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAvatarContext } from '@/app/newspaper/components/AvatarContext'

/**
 * Same fetching logic as ContributorAvatar:
 * 1. AvatarContext (populated by the /newspaper page)
 * 2. Module-level cache (shared across instances)
 * 3. Fallback: /Test/api/user-profile
 *
 * Adds larger sizes (lg, xl) for podium display.
 */

const avatarCache = new Map<string, string | null>()
const pendingRequests = new Map<string, Promise<string | null>>()

interface UserAvatarProps {
  username: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

export function UserAvatar({ username, size = 'md', className = '' }: UserAvatarProps) {
  const safeUsername = username || ''
  const lookupUsername = safeUsername.trim().replace(/^@+/, '')
  const lowerUsername = lookupUsername.toLowerCase()
  const { getAvatar: getContextAvatar, hasAvatar: hasContextAvatar, addAvatar } = useAvatarContext()

  const getInitialAvatar = (): string | null => {
    const directContextAvatar = getContextAvatar(safeUsername)
    if (directContextAvatar) return directContextAvatar

    const normalizedContextAvatar = lookupUsername ? getContextAvatar(lookupUsername) : undefined
    if (normalizedContextAvatar) return normalizedContextAvatar

    return avatarCache.get(lowerUsername) ?? null
  }

  const [avatar, setAvatar] = useState<string | null>(lookupUsername ? getInitialAvatar() : null)
  const [isLoading, setIsLoading] = useState(
    lookupUsername
      ? !hasContextAvatar(safeUsername) && !hasContextAvatar(lookupUsername) && !avatarCache.has(lowerUsername)
      : false
  )

  useEffect(() => {
    if (!lookupUsername) { setIsLoading(false); return }

    const directContextAvatar = getContextAvatar(safeUsername)
    if (directContextAvatar) {
      setAvatar(directContextAvatar)
      setIsLoading(false)
      return
    }

    const normalizedContextAvatar = getContextAvatar(lookupUsername)
    if (normalizedContextAvatar) {
      setAvatar(normalizedContextAvatar)
      setIsLoading(false)
      return
    }

    if (avatarCache.has(lowerUsername)) {
      setAvatar(avatarCache.get(lowerUsername) ?? null)
      setIsLoading(false)
      return
    }

    const fetchAvatar = async () => {
      const pending = pendingRequests.get(lowerUsername)
      if (pending) {
        try { setAvatar(await pending) } catch { /* noop */ }
        finally { setIsLoading(false) }
        return
      }

      const requestPromise = (async (): Promise<string | null> => {
        try {
          const res = await fetch(`/Test/api/user-profile?username=${encodeURIComponent(lookupUsername)}`)
          if (res.ok) {
            const profile = await res.json()
            const url = profile?.avatar ?? null
            avatarCache.set(lowerUsername, url)
            addAvatar(safeUsername, url)
            addAvatar(lookupUsername, url)
            return url
          }
          avatarCache.set(lowerUsername, null)
          return null
        } catch {
          avatarCache.set(lowerUsername, null)
          return null
        }
      })()

      pendingRequests.set(lowerUsername, requestPromise)
      try { setAvatar(await requestPromise) }
      finally { pendingRequests.delete(lowerUsername); setIsLoading(false) }
    }

    fetchAvatar()
  }, [safeUsername, lookupUsername, lowerUsername, getContextAvatar, addAvatar])

  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-9 w-9',
    lg: 'h-12 w-12 md:h-14 md:w-14',
    xl: 'h-16 w-16 md:h-20 md:w-20',
  }

  const fallbackTextSize = {
    sm: 'text-[10px]',
    md: 'text-xs',
    lg: 'text-sm',
    xl: 'text-base',
  }

  if (!safeUsername) return null

  return (
    <Avatar className={`${sizeClasses[size]} ${className}`}>
      <AvatarImage
        src={avatar ?? undefined}
        alt={safeUsername}
        className="object-cover"
      />
      <AvatarFallback className={`${fallbackTextSize[size]} font-bold`}>
        {isLoading ? (
          <span className="animate-pulse">·</span>
        ) : (
          safeUsername.slice(0, 2).toUpperCase()
        )}
      </AvatarFallback>
    </Avatar>
  )
}
