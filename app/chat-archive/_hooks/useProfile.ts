'use client'

import { useEffect, useState } from 'react'
import { getProfile } from '../_lib/api'
import type { Profile } from '../_lib/types'

interface UseProfileResult {
  profile: Profile | null
  isLoading: boolean
  error: string | null
}

export function useProfile(username: string): UseProfileResult {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!username) return

    const controller = new AbortController()
    let active = true

    setIsLoading(true)
    setError(null)

    getProfile(username, controller.signal)
      .then((data) => {
        if (active) setProfile(data)
      })
      .catch((err: unknown) => {
        if (active && !controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Failed to load profile')
        }
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [username])

  return { profile, isLoading, error }
}
