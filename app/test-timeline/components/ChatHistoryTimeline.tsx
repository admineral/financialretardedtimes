/**
 * ChatHistoryTimeline.tsx
 * 
 * AI-powered timeline showing key chat moments over multiple days.
 * 
 * LOCAL: Fetches chat data from the newspaper cache, extracts key events,
 * and displays them on a visual horizontal timeline.
 * 
 * GLOBAL: Reusable component that shows community chat highlights over time.
 * Similar to Fear & Greed - analyzes chat and visualizes the history.
 * 
 * EXPORTS: ChatHistoryTimeline (React component)
 */

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Loader2, MessageSquare, TrendingUp, TrendingDown, Zap, Users, AlertTriangle, Sparkles, RefreshCw } from 'lucide-react'

// Event types for chat moments
type ChatEventType = 'discussion' | 'prediction' | 'drama' | 'insight' | 'milestone' | 'humor'

interface ChatEvent {
  id: string
  date: string
  time: string // HH:MM format
  title: string
  description: string
  type: ChatEventType
  participants: string[]
  messageCount?: number
}


interface ChatHistoryTimelineProps {
  className?: string
  title?: string
  autoStart?: boolean
  showRefreshButton?: boolean
}

interface CacheResponse {
  events: ChatEvent[]
  eventCount: number
  dateRangeStart?: string
  dateRangeEnd?: string
  updatedAt: string
}

// Get style for event type
function getEventStyle(type: ChatEventType) {
  switch (type) {
    case 'discussion':
      return {
        icon: MessageSquare,
        bg: 'bg-blue-500/20',
        border: 'border-blue-500/50',
        text: 'text-blue-400',
        label: 'Diskussion'
      }
    case 'prediction':
      return {
        icon: TrendingUp,
        bg: 'bg-emerald-500/20',
        border: 'border-emerald-500/50',
        text: 'text-emerald-400',
        label: 'Prognose'
      }
    case 'drama':
      return {
        icon: AlertTriangle,
        bg: 'bg-red-500/20',
        border: 'border-red-500/50',
        text: 'text-red-400',
        label: 'Drama'
      }
    case 'insight':
      return {
        icon: Sparkles,
        bg: 'bg-amber-500/20',
        border: 'border-amber-500/50',
        text: 'text-amber-400',
        label: 'Insight'
      }
    case 'milestone':
      return {
        icon: Zap,
        bg: 'bg-purple-500/20',
        border: 'border-purple-500/50',
        text: 'text-purple-400',
        label: 'Meilenstein'
      }
    case 'humor':
      return {
        icon: Users,
        bg: 'bg-pink-500/20',
        border: 'border-pink-500/50',
        text: 'text-pink-400',
        label: 'Humor'
      }
  }
}



/**
 * Single event card on the timeline - compact with hover expand
 */
function TimelineCard({ 
  event, 
  position 
}: { 
  event: ChatEvent
  position: 'top' | 'bottom'
}) {
  const style = getEventStyle(event.type)
  const Icon = style.icon
  
  return (
    <div className={`relative flex flex-col items-center ${position === 'top' ? 'mb-4' : 'mt-4'}`}>
      {/* Connector line */}
      <div className={`absolute ${position === 'top' ? 'bottom-0 translate-y-full' : 'top-0 -translate-y-full'} left-1/2 w-px h-8 ${style.bg}`} />
      
      {/* Card - compact, expands on hover */}
      <div 
        className={`group w-48 p-2.5 rounded-lg border ${style.bg} ${style.border} backdrop-blur-sm 
        transition-all duration-300 hover:w-64 hover:shadow-xl cursor-default
        ${position === 'top' ? 'origin-bottom' : 'origin-top'}`}
      >
        {/* Header with type, time and icon */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-bold uppercase tracking-wider ${style.text}`}>
              {style.label}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">
              {event.time}
            </span>
          </div>
          <Icon className={`w-3 h-3 ${style.text}`} />
        </div>
        
        {/* Title - always visible */}
        <h4 className="font-headline text-sm font-bold leading-tight">
          {event.title}
        </h4>
        
        {/* Description - only on hover */}
        <div className="max-h-0 overflow-hidden opacity-0 group-hover:max-h-24 group-hover:opacity-100 transition-all duration-300">
          <p className="text-[11px] text-muted-foreground leading-snug mt-2 line-clamp-3">
            {event.description}
          </p>
          
          {/* Participants - only on hover */}
          {event.participants.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {event.participants.slice(0, 3).map((p, i) => (
                <span key={i} className="text-[9px] px-1.5 py-0.5 bg-background/50 rounded">
                  @{p}
                </span>
              ))}
              {event.participants.length > 3 && (
                <span className="text-[9px] text-muted-foreground">
                  +{event.participants.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Dot on timeline */}
      <div className={`absolute ${position === 'top' ? '-bottom-6' : '-top-6'} left-1/2 -translate-x-1/2 
        w-3 h-3 rounded-full ${style.bg} border-2 ${style.border} z-10`} />
    </div>
  )
}

/**
 * Date marker on the timeline - prominent display
 */
function DateMarker({ date, messageCount }: { date: string; messageCount?: number }) {
  const d = new Date(date + 'T12:00:00')
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  
  const diffDays = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  
  const day = d.getDate()
  const weekday = d.toLocaleDateString('de-DE', { weekday: 'short' })
  const month = d.toLocaleDateString('de-DE', { month: 'short' })
  
  // Relative label for recent days
  let relativeLabel = ''
  if (diffDays === 0) relativeLabel = 'Heute'
  else if (diffDays === 1) relativeLabel = 'Gestern'
  else if (diffDays === 2) relativeLabel = 'Vorgestern'
  
  const isToday = diffDays === 0
  
  return (
    <div className="flex flex-col items-center mx-4 min-w-[70px]">
      {/* Vertical line above */}
      <div className="w-px h-12 bg-gradient-to-b from-transparent to-foreground/30" />
      
      {/* Date box */}
      <div className={`px-3 py-2 rounded-lg border text-center ${
        isToday 
          ? 'bg-primary/20 border-primary/50' 
          : 'bg-muted border-foreground/20'
      }`}>
        {relativeLabel ? (
          <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${
            isToday ? 'text-primary' : 'text-muted-foreground'
          }`}>
            {relativeLabel}
          </div>
        ) : (
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {weekday}
          </div>
        )}
        <div className={`text-2xl font-bold font-mono ${
          isToday ? 'text-primary' : 'text-foreground'
        }`}>
          {day}
        </div>
        <div className="text-xs text-muted-foreground">
          {month}
        </div>
        {messageCount && (
          <div className="text-[9px] text-muted-foreground/60 mt-1 pt-1 border-t border-foreground/10">
            {messageCount} msgs
          </div>
        )}
      </div>
      
      {/* Vertical line below */}
      <div className="w-px h-12 bg-gradient-to-t from-transparent to-foreground/30" />
    </div>
  )
}

/**
 * Format time ago in German
 */
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  if (diffMins < 1) return 'gerade eben'
  if (diffMins < 60) return `vor ${diffMins}m`
  if (diffHours < 24) return `vor ${diffHours}h`
  return `vor ${diffDays}d`
}

/**
 * Main Chat History Timeline Component
 */
export function ChatHistoryTimeline({ 
  className = '',
  title = 'Chat-Chronik',
  autoStart = false,
  showRefreshButton = true
}: ChatHistoryTimelineProps) {
  const [events, setEvents] = useState<ChatEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [cacheInfo, setCacheInfo] = useState<{ updatedAt: string } | null>(null)
  
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  // Check scroll position
  const checkScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setCanScrollLeft(scrollLeft > 0)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
  }, [])
  
  useEffect(() => {
    checkScroll()
    const ref = scrollRef.current
    ref?.addEventListener('scroll', checkScroll)
    window.addEventListener('resize', checkScroll)
    return () => {
      ref?.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
    }
  }, [checkScroll, events])
  
  // Scroll handlers
  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -350 : 350,
      behavior: 'smooth'
    })
  }

  // Load timeline from cache
  const loadTimeline = useCallback(async () => {
    if (isLoading || isRefreshing) return // Prevent duplicate calls
    
    setIsLoading(true)
    setError(null)
    
    try {
      // Try to get from cache first
      const cacheRes = await fetch('/test-timeline/api/cache')
      
      if (cacheRes.ok) {
        const cacheData: CacheResponse = await cacheRes.json()
        setEvents(cacheData.events)
        setCacheInfo({ updatedAt: cacheData.updatedAt })
        setHasLoaded(true)
        console.log('[ChatTimeline] Loaded from cache:', cacheData.eventCount, 'events')
      } else if (cacheRes.status === 404) {
        // No cache, generate new (only once)
        console.log('[ChatTimeline] No cache found, generating...')
        setIsLoading(false) // Stop loading before refresh
        await refreshTimeline()
        return // refreshTimeline handles its own state
      } else {
        throw new Error('Failed to load cache')
      }
      
    } catch (err) {
      console.error('[ChatTimeline] Error:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Laden')
      setHasLoaded(true) // Mark as loaded to prevent retry loop
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, isRefreshing])

  // Refresh timeline (regenerate from newspaper cache)
  const refreshTimeline = useCallback(async () => {
    if (isRefreshing) return // Prevent duplicate calls
    
    setIsRefreshing(true)
    setError(null)
    
    try {
      const res = await fetch('/test-timeline/api/cache', { method: 'POST' })
      
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Refresh failed')
      }
      
      const data: CacheResponse & { success: boolean } = await res.json()
      setEvents(data.events)
      setCacheInfo({ updatedAt: data.updatedAt })
      setHasLoaded(true)
      console.log('[ChatTimeline] Refreshed:', data.eventCount, 'events')
      
    } catch (err) {
      console.error('[ChatTimeline] Refresh error:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Aktualisieren')
      setHasLoaded(true) // Mark as loaded to prevent retry loop
    } finally {
      setIsRefreshing(false)
    }
  }, [isRefreshing])

  // Auto-start if enabled (only once)
  const hasStartedRef = useRef(false)
  useEffect(() => {
    if (autoStart && !hasStartedRef.current && !hasLoaded) {
      hasStartedRef.current = true
      loadTimeline()
    }
  }, [autoStart, hasLoaded, loadTimeline])

  // Group events by date for display
  const eventsByDate = events.reduce((acc, event) => {
    if (!acc[event.date]) acc[event.date] = []
    acc[event.date].push(event)
    return acc
  }, {} as Record<string, ChatEvent[]>)
  
  // Sort dates newest first (today on the left)
  const sortedDates = Object.keys(eventsByDate).sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  )

  return (
    <div className={`relative ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="font-headline text-lg font-bold flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-400" />
            {title}
          </h3>
          
          {/* Cache info */}
          {cacheInfo && !isLoading && !isRefreshing && (
            <span className="text-[10px] text-muted-foreground/60">
              {formatTimeAgo(cacheInfo.updatedAt)}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Refresh button */}
          {showRefreshButton && hasLoaded && (
            <button
              onClick={refreshTimeline}
              disabled={isRefreshing}
              className="p-1.5 rounded border border-foreground/20 hover:bg-muted disabled:opacity-50 transition-all"
              title="Timeline aktualisieren"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
          
          {/* Scroll buttons */}
          {hasLoaded && events.length > 0 && (
            <>
              <button
                onClick={() => scroll('left')}
                disabled={!canScrollLeft}
                className="p-1.5 rounded border border-foreground/20 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => scroll('right')}
                disabled={!canScrollRight}
                className="p-1.5 rounded border border-foreground/20 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
          
          {!hasLoaded && !isLoading && (
            <button
              onClick={loadTimeline}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
            >
              📜 Timeline laden
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      {hasLoaded && events.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4 text-[10px]">
          {(['insight', 'discussion', 'prediction', 'drama', 'humor'] as ChatEventType[]).map(type => {
            const style = getEventStyle(type)
            return (
              <div key={type} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${style.bg} border ${style.border}`} />
                <span className="text-muted-foreground">{style.label}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Lade Chat-Historie...</p>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={loadTimeline}
            className="mt-3 text-sm text-primary hover:underline"
          >
            Erneut versuchen
          </button>
        </div>
      )}

      {/* Empty state - not loaded yet */}
      {!hasLoaded && !isLoading && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MessageSquare className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground mb-2">Chat-Chronik</p>
          <p className="text-sm text-muted-foreground/60 max-w-sm">
            Zeigt wichtige Momente und Diskussionen aus dem TradingView-Chat der letzten Tage.
          </p>
        </div>
      )}

      {/* Timeline content */}
      {hasLoaded && events.length > 0 && !isLoading && (
        <div className="relative">
          {/* Gradient overlays */}
          {canScrollLeft && (
            <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-background to-transparent z-20 pointer-events-none" />
          )}
          {canScrollRight && (
            <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-background to-transparent z-20 pointer-events-none" />
          )}
          
          {/* Scrollable container */}
          <div 
            ref={scrollRef}
            className="overflow-x-auto pb-4"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <div className="relative min-w-max px-8 py-16">
              {/* Main timeline line */}
              <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-gradient-to-r from-foreground/5 via-foreground/20 to-foreground/5" />
              
              {/* Events by date */}
              <div className="relative flex items-center gap-4">
                {sortedDates.map((date, dateIdx) => {
                  const dateEvents = eventsByDate[date]
                  const firstEvent = dateEvents[0]
                  
                  return (
                    <div key={date} className="flex items-center">
                      {/* Date marker */}
                      <DateMarker date={date} messageCount={firstEvent?.messageCount} />
                      
                      {/* Events for this date */}
                      <div className="flex items-center gap-2">
                        {dateEvents.map((event, idx) => (
                          <TimelineCard 
                            key={event.id}
                            event={event}
                            position={idx % 2 === 0 ? 'top' : 'bottom'}
                          />
                        ))}
                      </div>
                      
                      {/* Spacer between dates */}
                      {dateIdx < sortedDates.length - 1 && (
                        <div className="w-8 h-px bg-foreground/10" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          
          {/* Scroll hint */}
          <p className="text-center text-[10px] text-muted-foreground mt-2">
            Heute ← Scrolle für ältere Events →
          </p>
        </div>
      )}

      {/* Empty loaded state */}
      {hasLoaded && events.length === 0 && !isLoading && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MessageSquare className="w-8 h-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Keine Chat-Events gefunden</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Generiere zuerst Zeitungen für mehrere Tage
          </p>
        </div>
      )}
    </div>
  )
}

