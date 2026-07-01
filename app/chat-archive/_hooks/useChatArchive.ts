'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getChatArchive } from '../_lib/api'
import type { ChatArchiveData } from '../_lib/types'

interface UseChatArchiveArgs {
  room: string
  date: string
  username: string
  autoLoad?: boolean
}

interface UseChatArchiveResult {
  data: ChatArchiveData | null
  isLoading: boolean
  error: string | null
  currentPage: number
  singlePage: boolean
  load: () => void
  loadPage: (page: number) => void
}

export function useChatArchive({
  room,
  date,
  username,
  autoLoad = true,
}: UseChatArchiveArgs): UseChatArchiveResult {
  const [data, setData] = useState<ChatArchiveData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [singlePage, setSinglePage] = useState(false)

  // Tracks the "room|date|username" we last loaded, so we don't refetch endlessly.
  const loadedKeyRef = useRef<string | null>(null)

  const fetchArchive = useCallback(
    async (specificPage?: number) => {
      if (!room || !date || !username) {
        setError('Missing room, date, or username.')
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const result = await getChatArchive({
          room,
          date,
          username,
          startPage: specificPage ?? 1,
          maxPages: specificPage ? 1 : 10,
        })
        setData(result)
        setCurrentPage(specificPage ?? 1)
        setSinglePage(Boolean(specificPage))
        loadedKeyRef.current = `${room}|${date}|${username}`
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load chat archive')
      } finally {
        setIsLoading(false)
      }
    },
    [room, date, username]
  )

  const load = useCallback(() => {
    void fetchArchive()
  }, [fetchArchive])

  const loadPage = useCallback(
    (page: number) => {
      void fetchArchive(page)
    },
    [fetchArchive]
  )

  useEffect(() => {
    if (!autoLoad || !room || !username || !date) return
    const key = `${room}|${date}|${username}`
    if (loadedKeyRef.current !== key) {
      void fetchArchive()
    }
  }, [autoLoad, room, date, username, fetchArchive])

  return { data, isLoading, error, currentPage, singlePage, load, loadPage }
}
