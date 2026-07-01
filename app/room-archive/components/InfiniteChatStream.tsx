'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2Icon, MessageSquareIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatMessage {
  id: string
  username: string
  text: string
  time: string
  user_pic?: string
  is_moderator?: boolean
}

interface DayBlock {
  date: string
  displayDate: string
  messages: ChatMessage[]
  hasMoreBefore: boolean
  isLoading: boolean
  totalCount: number
}

interface InfiniteChatStreamProps {
  selectedDate: string
  availableDates: string[]
  roomId?: string
  onDateChange?: (date: string) => void
  className?: string
  compact?: boolean
}

const MESSAGE_LIMIT = 200
const DEFAULT_ROOM = 'bitcoin_de_DE'

function formatDisplayDate(dateKey: string): string {
  const date = new Date(dateKey + 'T12:00:00')
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

export function InfiniteChatStream({
  selectedDate,
  availableDates,
  roomId = DEFAULT_ROOM,
  onDateChange,
  className,
  compact
}: InfiniteChatStreamProps) {
  const [dayBlocks, setDayBlocks] = useState<DayBlock[]>([])
  const [isLoadingInitial, setIsLoadingInitial] = useState(true)
  const [isLoadingOlderDay, setIsLoadingOlderDay] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const isPrependingRef = useRef(false)
  const prevScrollHeightRef = useRef(0)
  const loadedDatesRef = useRef(new Set<string>())

  const fetchDayMessages = useCallback(async (date: string, before?: string): Promise<{
    messages: ChatMessage[]
    hasMoreBefore: boolean
    totalCount: number
  }> => {
    const params = new URLSearchParams({
      date,
      room: roomId,
      limit: String(MESSAGE_LIMIT)
    })
    if (before) params.set('before', before)

    const response = await fetch(`/room-archive/api/messages?${params}`)
    if (!response.ok) throw new Error('Failed to load messages')
    const data = await response.json()
    return {
      messages: data.messages || [],
      hasMoreBefore: data.hasMoreBefore || false,
      totalCount: data.totalCount || 0
    }
  }, [roomId])

  const loadDay = useCallback(async (date: string, prepend = false) => {
    if (loadedDatesRef.current.has(date) && !prepend) return

    const { messages, hasMoreBefore, totalCount } = await fetchDayMessages(date)

    const block: DayBlock = {
      date,
      displayDate: formatDisplayDate(date),
      messages,
      hasMoreBefore,
      isLoading: false,
      totalCount
    }

    setDayBlocks(prev => {
      if (prepend) {
        if (prev.some(b => b.date === date)) return prev
        return [block, ...prev]
      }
      return [block]
    })

    loadedDatesRef.current.add(date)
  }, [fetchDayMessages])

  const [reloadKey, setReloadKey] = useState(0)

  // Initial load when selected date changes (or on manual retry)
  useEffect(() => {
    loadedDatesRef.current.clear()
    setDayBlocks([])
    setIsLoadingInitial(true)
    setError(null)

    loadDay(selectedDate)
      .catch(err => setError(err instanceof Error ? err.message : 'Error'))
      .finally(() => setIsLoadingInitial(false))
  }, [selectedDate, loadDay, reloadKey])

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!isLoadingInitial && scrollRef.current && dayBlocks.length === 1) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [isLoadingInitial, dayBlocks])

  // Load older messages within current oldest day
  const loadOlderInDay = useCallback(async (date: string) => {
    const block = dayBlocks.find(b => b.date === date)
    if (!block || !block.hasMoreBefore || block.isLoading) return

    setDayBlocks(prev =>
      prev.map(b => (b.date === date ? { ...b, isLoading: true } : b))
    )

    try {
      const oldestTime = block.messages[0]?.time
      if (!oldestTime) return

      const { messages, hasMoreBefore, totalCount } = await fetchDayMessages(date, oldestTime)

      if (messages.length === 0) {
        setDayBlocks(prev =>
          prev.map(b => (b.date === date ? { ...b, hasMoreBefore: false, isLoading: false } : b))
        )
        return
      }

      isPrependingRef.current = true
      prevScrollHeightRef.current = scrollRef.current?.scrollHeight || 0

      setDayBlocks(prev =>
        prev.map(b => {
          if (b.date !== date) return b
          const existingIds = new Set(b.messages.map(m => m.id))
          const newMsgs = messages.filter(m => !existingIds.has(m.id))
          return {
            ...b,
            messages: [...newMsgs, ...b.messages],
            hasMoreBefore,
            totalCount,
            isLoading: false
          }
        })
      )
    } catch {
      setDayBlocks(prev =>
        prev.map(b => (b.date === date ? { ...b, isLoading: false } : b))
      )
    }
  }, [dayBlocks, fetchDayMessages])

  // Load previous day
  const loadPreviousDay = useCallback(async () => {
    if (dayBlocks.length === 0 || isLoadingOlderDay) return

    const oldestLoadedDate = dayBlocks[0].date
    const dateIndex = availableDates.indexOf(oldestLoadedDate)
    if (dateIndex < 0 || dateIndex >= availableDates.length - 1) return

    const previousDate = availableDates[dateIndex + 1]
    if (loadedDatesRef.current.has(previousDate)) return

    setIsLoadingOlderDay(true)
    isPrependingRef.current = true
    prevScrollHeightRef.current = scrollRef.current?.scrollHeight || 0

    try {
      await loadDay(previousDate, true)
    } finally {
      setIsLoadingOlderDay(false)
    }
  }, [dayBlocks, availableDates, isLoadingOlderDay, loadDay])

  // Maintain scroll position when prepending
  useEffect(() => {
    if (isPrependingRef.current && scrollRef.current) {
      const newHeight = scrollRef.current.scrollHeight
      scrollRef.current.scrollTop += newHeight - prevScrollHeightRef.current
      isPrependingRef.current = false
    }
  }, [dayBlocks])

  // Intersection observers for infinite scroll
  useEffect(() => {
    const topSentinel = topSentinelRef.current
    const scrollEl = scrollRef.current
    if (!topSentinel || !scrollEl) return

    const observer = new IntersectionObserver(
      entries => {
        if (!entries[0]?.isIntersecting) return

        const oldestBlock = dayBlocks[0]
        if (!oldestBlock) return

        if (oldestBlock.hasMoreBefore) {
          loadOlderInDay(oldestBlock.date)
        } else {
          loadPreviousDay()
        }
      },
      { root: scrollEl, rootMargin: '100px' }
    )

    observer.observe(topSentinel)
    return () => observer.disconnect()
  }, [dayBlocks, loadOlderInDay, loadPreviousDay])

  const hasMoreDays = dayBlocks.length > 0 && (() => {
    const oldest = dayBlocks[0].date
    const idx = availableDates.indexOf(oldest)
    return idx >= 0 && idx < availableDates.length - 1
  })()

  return (
    <div className={cn('flex flex-col rounded-lg border border-foreground/10 bg-card overflow-hidden', className)}>
      {!compact && (
        <div className="px-4 py-2 border-b border-foreground/10 bg-muted/20 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Scroll nach oben für ältere Tage · {dayBlocks.length} Tag{dayBlocks.length !== 1 ? 'e' : ''} geladen
          </span>
          {onDateChange && (
            <button
              type="button"
              onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
              className="text-primary hover:underline"
            >
              Nach unten
            </button>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        className={cn(
          'flex-1 overflow-y-auto px-4 py-2',
          compact ? 'max-h-[260px] min-h-[200px]' : 'max-h-[70vh] min-h-[400px]'
        )}
      >
        <div ref={topSentinelRef} className="h-1" />

        {(isLoadingOlderDay || dayBlocks[0]?.isLoading) && (
          <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground text-sm">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            <span>Ältere Nachrichten laden...</span>
          </div>
        )}

        {!hasMoreDays && dayBlocks.length > 0 && !dayBlocks[0]?.hasMoreBefore && (
          <div className="text-center py-4 text-xs text-muted-foreground/60">
            Anfang des Archivs erreicht
          </div>
        )}

        {isLoadingInitial ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2Icon className="h-5 w-5 animate-spin mr-2" />
            Lade Chat...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <p className="text-sm text-red-500">{error}</p>
            <button
              type="button"
              onClick={() => setReloadKey(k => k + 1)}
              className="text-xs font-mono px-3 py-1.5 rounded-md border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
            >
              Erneut versuchen
            </button>
          </div>
        ) : (
          dayBlocks.map(block => (
            <div key={block.date} className="mb-6">
              <div className="sticky top-0 z-10 flex items-center gap-3 py-2 mb-2 bg-card/95 backdrop-blur-sm">
                <div className="h-px flex-1 bg-primary/20" />
                <div className="flex flex-col items-center px-3">
                  <span className="text-xs font-headline font-semibold text-primary">
                    {block.displayDate}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {block.messages.length.toLocaleString('de-DE')}
                    {block.totalCount > block.messages.length && ` / ${block.totalCount.toLocaleString('de-DE')}`}
                    {' '}Nachrichten
                  </span>
                </div>
                <div className="h-px flex-1 bg-primary/20" />
              </div>

              {block.messages.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-muted-foreground">
                  <MessageSquareIcon className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">Keine Nachrichten an diesem Tag</p>
                </div>
              ) : (
              <div className="space-y-1">
                {block.messages.map((msg, idx) => {
                  const prevMsg = block.messages[idx - 1]
                  const showHeader = !prevMsg || prevMsg.username !== msg.username ||
                    new Date(msg.time).getTime() - new Date(prevMsg.time).getTime() > 5 * 60 * 1000

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex items-start gap-2 py-1 px-2 rounded-sm hover:bg-muted/30 transition-colors',
                        showHeader && 'mt-2'
                      )}
                    >
                      {showHeader ? (
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                          {msg.user_pic ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={msg.user_pic} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[10px] font-medium text-muted-foreground">
                              {msg.username.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="w-7 flex-shrink-0" />
                      )}

                      <div className="flex-1 min-w-0">
                        {showHeader && (
                          <div className="flex items-center gap-2 mb-0.5">
                            <Link
                              href={`/chat-archive?username=${encodeURIComponent(msg.username)}&room=${roomId}`}
                              className={cn(
                                'font-medium text-sm hover:text-primary transition-colors',
                                msg.is_moderator && 'text-amber-500'
                              )}
                            >
                              {msg.username}
                            </Link>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {new Date(msg.time).toLocaleTimeString('de-DE', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                        )}
                        <p className="text-sm text-foreground/90 break-words leading-relaxed">
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
