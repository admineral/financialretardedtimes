/**
 * AvatarContext.tsx
 * 
 * Provides a shared avatar cache across newspaper components.
 * Avatars fetched once (e.g., from /api/date-chatters) are available
 * to all child components without additional API calls.
 */

'use client'

import { createContext, useContext, useCallback, useRef, ReactNode } from 'react'

interface AvatarContextValue {
  /** Get avatar URL for a username (returns undefined if not in cache) */
  getAvatar: (username: string) => string | undefined
  /** Add multiple avatars to the cache */
  addAvatars: (avatars: Record<string, string | null>) => void
  /** Add a single avatar to the cache */
  addAvatar: (username: string, avatar: string | null) => void
  /** Check if avatar is in cache */
  hasAvatar: (username: string) => boolean
}

const AvatarContext = createContext<AvatarContextValue | null>(null)

export function AvatarProvider({ children }: { children: ReactNode }) {
  // Use ref to avoid re-renders when cache updates
  const cacheRef = useRef<Map<string, string | null>>(new Map())

  const getAvatar = useCallback((username: string): string | undefined => {
    const cached = cacheRef.current.get(username.toLowerCase())
    return cached ?? undefined
  }, [])

  const addAvatars = useCallback((avatars: Record<string, string | null>) => {
    for (const [username, avatar] of Object.entries(avatars)) {
      cacheRef.current.set(username.toLowerCase(), avatar)
    }
  }, [])

  const addAvatar = useCallback((username: string, avatar: string | null) => {
    cacheRef.current.set(username.toLowerCase(), avatar)
  }, [])

  const hasAvatar = useCallback((username: string): boolean => {
    return cacheRef.current.has(username.toLowerCase())
  }, [])

  return (
    <AvatarContext.Provider value={{ getAvatar, addAvatars, addAvatar, hasAvatar }}>
      {children}
    </AvatarContext.Provider>
  )
}

export function useAvatarContext() {
  const context = useContext(AvatarContext)
  if (!context) {
    // Return a no-op implementation if used outside provider
    return {
      getAvatar: () => undefined,
      addAvatars: () => {},
      addAvatar: () => {},
      hasAvatar: () => false
    }
  }
  return context
}

