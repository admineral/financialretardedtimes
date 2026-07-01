'use client'

import { useCallback, useEffect, useState } from 'react'
import type { UserRange } from '../lib/range-utils'

export interface TopUser {
  username: string
  messageCount: number
  user_pic?: string
  is_moderator?: boolean
}

const DEFAULT_ROOM = 'bitcoin_de_DE'

export function useTopUsers(range: UserRange, date?: string | null, limit = 15) {
  const [users, setUsers] = useState<TopUser[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        room: DEFAULT_ROOM,
        range,
        limit: String(limit)
      })
      if (range === 'day' && date) params.set('date', date)

      const res = await fetch(`/room-archive/api/users?${params}`)
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
      }
    } catch (e) {
      console.error('useTopUsers', e)
    } finally {
      setIsLoading(false)
    }
  }, [range, date, limit])

  useEffect(() => {
    if (range === 'day' && !date) {
      setUsers([])
      return
    }
    void fetchUsers()
  }, [range, date, fetchUsers])

  return { users, isLoading, refresh: fetchUsers }
}

export function useTopUsersMulti(ranges: UserRange[], date?: string | null) {
  const [data, setData] = useState<Record<UserRange, TopUser[]>>({
    day: [],
    '7d': [],
    '30d': [],
    all: []
  })
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    Promise.all(
      ranges.map(async range => {
        const params = new URLSearchParams({ room: DEFAULT_ROOM, range, limit: '10' })
        if (range === 'day' && date) params.set('date', date)
        const res = await fetch(`/room-archive/api/users?${params}`)
        if (!res.ok) return [range, []] as const
        const json = await res.json()
        return [range, json.users || []] as const
      })
    )
      .then(results => {
        if (cancelled) return
        setData(prev => {
          const next = { ...prev }
          for (const [range, users] of results) {
            next[range as UserRange] = users
          }
          return next
        })
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [ranges.join(','), date])

  return { data, isLoading }
}
