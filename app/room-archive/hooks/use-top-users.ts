'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { UserRange } from '../lib/range-utils'
import {
  readTopUsersCache,
  topUsersCacheKey,
  writeTopUsersCache
} from '../lib/client-cache'

export interface TopUser {
  username: string
  messageCount: number
  user_pic?: string
  is_moderator?: boolean
}

const DEFAULT_ROOM = 'bitcoin_de_DE'

async function fetchTopUsers(
  range: UserRange,
  date: string | null | undefined,
  limit: number
): Promise<TopUser[]> {
  const params = new URLSearchParams({
    room: DEFAULT_ROOM,
    range,
    limit: String(limit)
  })
  if (range === 'day' && date) params.set('date', date)

  const res = await fetch(`/room-archive/api/users?${params}`)
  if (!res.ok) return []
  const json = await res.json()
  return json.users || []
}

export function useTopUsers(range: UserRange, date?: string | null, limit = 15) {
  const cacheKey = topUsersCacheKey(DEFAULT_ROOM, range, date, limit)
  const initialCache = useMemo(() => readTopUsersCache(cacheKey), [cacheKey])
  const hasHydrated = useRef(Boolean(initialCache?.length))
  const [users, setUsers] = useState<TopUser[]>(initialCache ?? [])
  const [isLoading, setIsLoading] = useState(!initialCache && !(range === 'day' && !date))
  const [isRevalidating, setIsRevalidating] = useState(false)

  const load = useCallback(async () => {
    if (range === 'day' && !date) {
      setUsers([])
      setIsLoading(false)
      return
    }

    setIsRevalidating(hasHydrated.current)
    if (!hasHydrated.current) setIsLoading(true)

    try {
      const fresh = await fetchTopUsers(range, date, limit)
      setUsers(fresh)
      writeTopUsersCache(cacheKey, fresh)
      hasHydrated.current = true
    } catch (e) {
      console.error('useTopUsers', e)
    } finally {
      setIsLoading(false)
      setIsRevalidating(false)
    }
  }, [cacheKey, range, date, limit])

  useEffect(() => {
    const cached = readTopUsersCache(cacheKey)
    if (cached?.length) {
      setUsers(cached)
      hasHydrated.current = true
      setIsLoading(false)
    }
    void load()
  }, [cacheKey, load])

  return { users, isLoading, isRevalidating, refresh: load }
}

const EMPTY_MULTI: Record<UserRange, TopUser[]> = {
  day: [],
  '7d': [],
  '30d': [],
  all: []
}

export function useTopUsersMulti(
  ranges: UserRange[],
  date?: string | null,
  limit = 10
) {
  const rangesKey = ranges.join(',')
  const [data, setData] = useState<Record<UserRange, TopUser[]>>(() => {
    const next = { ...EMPTY_MULTI }
    for (const range of ranges) {
      if (range === 'day' && !date) continue
      const cached = readTopUsersCache(topUsersCacheKey(DEFAULT_ROOM, range, date, limit))
      if (cached) next[range] = cached
    }
    return next
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const effectKey = `${rangesKey}:${date || ''}:${limit}`
    let cancelled = false

    const cachedResults = ranges.map(range => {
      if (range === 'day' && !date) return [range, []] as const
      const key = topUsersCacheKey(DEFAULT_ROOM, range, date, limit)
      return [range, readTopUsersCache(key)] as const
    })

    const hasAnyCached = cachedResults.some(([, users]) => users?.length)
    if (hasAnyCached) {
      setData(prev => {
        const next = { ...prev }
        for (const [range, users] of cachedResults) {
          if (users?.length) next[range as UserRange] = [...users]
        }
        return next
      })
      setIsLoading(false)
    } else {
      setIsLoading(true)
    }

    Promise.all(
      ranges.map(async range => {
        if (range === 'day' && !date) return [range, []] as const
        const key = topUsersCacheKey(DEFAULT_ROOM, range, date, limit)
        const cached = readTopUsersCache(key)
        if (cached?.length) return [range, cached] as const
        const fresh = await fetchTopUsers(range, date, limit)
        writeTopUsersCache(key, fresh)
        return [range, fresh] as const
      })
    )
      .then(results => {
        if (cancelled) return
        setData(prev => {
          const next = { ...prev }
          for (const [range, users] of results) {
            next[range as UserRange] = [...users]
          }
          return next
        })
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [rangesKey, date, limit, ranges])

  return { data, isLoading }
}
