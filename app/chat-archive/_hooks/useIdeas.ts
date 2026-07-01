'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { clearIdeasCache, getIdeas } from '../_lib/api'
import type { Idea } from '../_lib/types'

interface UseIdeasResult {
  ideas: Idea[]
  page: number
  isLoading: boolean
  error: string | null
  hasNextPage: boolean
  goToPage: (page: number) => void
  retry: () => void
  refresh: () => Promise<void>
  isRefreshing: boolean
}

export function useIdeas(username: string, enabled: boolean): UseIdeasResult {
  const [page, setPage] = useState(1)
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasNextPage, setHasNextPage] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const cacheRef = useRef<Map<number, Idea[]>>(new Map())
  const inFlightRef = useRef<Set<number>>(new Set())

  const load = useCallback(
    async (targetPage: number) => {
      if (!username) return

      const cached = cacheRef.current.get(targetPage)
      if (cached) {
        setIdeas(cached)
        setError(null)
        return
      }

      if (inFlightRef.current.has(targetPage)) return
      inFlightRef.current.add(targetPage)
      setIsLoading(true)
      setError(null)

      try {
        const data = await getIdeas(username, targetPage)
        cacheRef.current.set(targetPage, data.ideas)
        setIdeas(data.ideas)
        setHasNextPage(Boolean(data.hasNextPage))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load ideas')
        setIdeas([])
      } finally {
        inFlightRef.current.delete(targetPage)
        setIsLoading(false)
      }
    },
    [username]
  )

  useEffect(() => {
    if (enabled && username) {
      void load(page)
    }
  }, [enabled, username, page, load])

  const goToPage = useCallback((next: number) => {
    if (next < 1) return
    setPage(next)
  }, [])

  const retry = useCallback(() => {
    cacheRef.current.delete(page)
    void load(page)
  }, [page, load])

  const refresh = useCallback(async () => {
    if (!username) return
    setIsRefreshing(true)
    try {
      await clearIdeasCache(username)
      cacheRef.current.clear()
      setHasNextPage(true)
      setPage(1)
      await load(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh ideas')
    } finally {
      setIsRefreshing(false)
    }
  }, [username, load])

  return {
    ideas,
    page,
    isLoading,
    error,
    hasNextPage,
    goToPage,
    retry,
    refresh,
    isRefreshing,
  }
}
