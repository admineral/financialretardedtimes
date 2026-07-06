'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SyncHistoryEntry {
  id: number
  started_at: string
  completed_at: string | null
  success: boolean
  messages_inserted: number
  messages_fetched?: number
  duplicates_skipped?: number
  trigger_type: string
  error_message?: string | null
}

interface SyncHistoryListProps {
  roomId?: string
  className?: string
}

const DEFAULT_ROOM = 'bitcoin_de_DE'
const PAGE_SIZE = 20

export function SyncHistoryList({ roomId = DEFAULT_ROOM, className }: SyncHistoryListProps) {
  const [entries, setEntries] = useState<SyncHistoryEntry[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [isLoadingInitial, setIsLoadingInitial] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)

  const loadPage = useCallback(async (pageOffset: number, append: boolean) => {
    if (loadingRef.current) return
    loadingRef.current = true

    if (append) setIsLoadingMore(true)
    else setIsLoadingInitial(true)

    try {
      const params = new URLSearchParams({
        room: roomId,
        offset: String(pageOffset),
        limit: String(PAGE_SIZE)
      })
      const response = await fetch(`/room-archive/api/sync-history?${params}`)
      if (!response.ok) throw new Error('Failed to load sync history')

      const data = await response.json()
      const newEntries: SyncHistoryEntry[] = data.entries || []

      setEntries(prev => (append ? [...prev, ...newEntries] : newEntries))
      setOffset(data.nextOffset ?? pageOffset + newEntries.length)
      setHasMore(Boolean(data.hasMore))
      setTotalCount(data.totalCount ?? 0)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading sync history')
    } finally {
      loadingRef.current = false
      setIsLoadingInitial(false)
      setIsLoadingMore(false)
    }
  }, [roomId])

  useEffect(() => {
    setEntries([])
    setOffset(0)
    setHasMore(true)
    loadPage(0, false)
  }, [loadPage])

  useEffect(() => {
    const sentinel = sentinelRef.current
    const root = scrollRef.current
    if (!sentinel || !root || !hasMore || isLoadingInitial || isLoadingMore) return

    const observer = new IntersectionObserver(
      entriesObserved => {
        if (entriesObserved[0]?.isIntersecting && hasMore && !loadingRef.current) {
          loadPage(offset, true)
        }
      },
      { root, rootMargin: '40px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, isLoadingInitial, isLoadingMore, loadPage, offset])

  return (
    <div className={cn('rounded-lg border border-foreground/10 bg-card p-5', className)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-headline text-sm text-muted-foreground">Sync-Verlauf</h3>
        {totalCount > 0 && (
          <span className="text-[10px] font-mono text-muted-foreground/60">
            {entries.length.toLocaleString('de-DE')} / {totalCount.toLocaleString('de-DE')}
          </span>
        )}
      </div>

      <div ref={scrollRef} className="max-h-[320px] overflow-y-auto pr-1 space-y-0">
        {isLoadingInitial ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-xs">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            Lade Sync-Verlauf...
          </div>
        ) : error ? (
          <p className="text-xs text-red-500 py-4 text-center">{error}</p>
        ) : entries.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Kein Sync-Verlauf</p>
        ) : (
          entries.map(entry => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-3 text-xs py-2 border-b border-foreground/5 last:border-0"
            >
              <span className={cn('flex-shrink-0', entry.success ? 'text-green-500' : 'text-red-500')}>
                {entry.success ? '✓' : '✗'} {entry.trigger_type}
              </span>
              <span className="font-mono text-muted-foreground flex-shrink-0">
                +{entry.messages_inserted}
                {entry.messages_fetched !== undefined && entry.messages_fetched > 0 && (
                  <span className="text-muted-foreground/50"> / {entry.messages_fetched}</span>
                )}
              </span>
              <span className="text-muted-foreground/60 text-right truncate">
                {new Date(entry.started_at).toLocaleString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
          ))
        )}

        <div ref={sentinelRef} className="h-1" />

        {isLoadingMore && (
          <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground text-xs">
            <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
            Mehr laden...
          </div>
        )}

        {!hasMore && entries.length > 0 && (
          <p className="text-[10px] text-muted-foreground/50 text-center py-3">
            Ende des Sync-Verlaufs
          </p>
        )}
      </div>
    </div>
  )
}
