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
  quote?: string
  quoteAuthor?: string
}

// AI Response event format (from /test-timeline/api/analyze)
interface AITimelineEvent {
  timestamp?: string
  time?: string
  date?: string
  title?: string
  quote?: string
  quoteAuthor?: string
  description?: string
  type?: ChatEventType
  participants?: string[]
  sentiment?: string
}


type TimelineMode = '24h' | '3d' | '7d'

interface ChatHistoryTimelineProps {
  className?: string
  title?: string
  autoStart?: boolean
  showRefreshButton?: boolean
  compact?: boolean // Minimal version for top placement
  defaultMode?: TimelineMode // Default: '24h'
}

interface ActivityBucket {
  timestamp: string
  label: string
  count: number
  uniqueUsers: number
  intensity: number
}

interface ActivityStats {
  totalMessages: number
  totalUsers: number
  maxPerBucket: number
  peakTime: string
}

interface CacheResponse {
  events: ChatEvent[]
  eventCount: number
  dateRangeStart?: string
  dateRangeEnd?: string
  updatedAt: string
  cached?: boolean
  expired?: boolean  // Cache older than 4 hours - must refresh
  stale?: boolean    // Cache older than 30 min - should refresh in background
  cacheAgeMinutes?: number
  metadata?: {
    mode: string
    messageCount: number
    uniqueUsers: number
    summary?: string
    activityLevel?: 'low' | 'medium' | 'high'
    dominantSentiment?: string
  }
}

// Get style for event type - High contrast colors for accessibility
function getEventStyle(type: ChatEventType) {
  switch (type) {
    case 'discussion':
      return {
        icon: MessageSquare,
        bg: 'bg-blue-500/20 dark:bg-blue-400/20',
        border: 'border-blue-600 dark:border-blue-400',
        text: 'text-blue-700 dark:text-blue-300',
        label: 'Diskussion'
      }
    case 'prediction':
      return {
        icon: TrendingUp,
        bg: 'bg-emerald-500/20 dark:bg-emerald-400/20',
        border: 'border-emerald-600 dark:border-emerald-400',
        text: 'text-emerald-700 dark:text-emerald-300',
        label: 'Prognose'
      }
    case 'drama':
      return {
        icon: AlertTriangle,
        bg: 'bg-red-500/20 dark:bg-red-400/20',
        border: 'border-red-600 dark:border-red-400',
        text: 'text-red-700 dark:text-red-300',
        label: 'Drama'
      }
    case 'insight':
      return {
        icon: Sparkles,
        bg: 'bg-amber-500/20 dark:bg-amber-400/20',
        border: 'border-amber-600 dark:border-amber-400',
        text: 'text-amber-700 dark:text-amber-300',
        label: 'Insight'
      }
    case 'milestone':
      return {
        icon: Zap,
        bg: 'bg-purple-500/20 dark:bg-purple-400/20',
        border: 'border-purple-600 dark:border-purple-400',
        text: 'text-purple-700 dark:text-purple-300',
        label: 'Meilenstein'
      }
    case 'humor':
      return {
        icon: Users,
        bg: 'bg-pink-500/20 dark:bg-pink-400/20',
        border: 'border-pink-600 dark:border-pink-400',
        text: 'text-pink-700 dark:text-pink-300',
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
                <span className="text-[9px] text-foreground/70 dark:text-foreground/80">
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
 * Compact event card for mini timeline - inline display with hover expand
 * Has delayed close so moving between cards feels smooth
 */
function CompactTimelineCard({ event }: { event: ChatEvent }) {
  const style = getEventStyle(event.type)
  
  return (
    <div className="group relative flex items-center">
      {/* Dot on timeline */}
      <div className={`absolute -bottom-[17px] left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${style.bg} border ${style.border} z-10
        transition-transform duration-200 delay-300 group-hover:delay-0 group-hover:scale-125`} />
      
      {/* Card - compact, expands on hover with delayed close */}
      <div className={`px-2 py-1.5 rounded border ${style.bg} ${style.border} backdrop-blur-sm 
        cursor-default 
        min-w-[140px] max-w-[180px] group-hover:min-w-[220px] group-hover:max-w-[260px]
        group-hover:shadow-lg group-hover:z-20
        transition-all duration-200 ease-out
        delay-500 group-hover:delay-0`}
      >
        {/* Type label and time */}
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={`text-[8px] font-bold uppercase tracking-wider ${style.text}`}>
            {style.label}
          </span>
          <span className="text-[9px] font-mono text-muted-foreground">
            {event.time}
          </span>
        </div>
        
        {/* Title - truncated, expands on hover */}
        <p className="text-[10px] font-medium leading-tight line-clamp-2 group-hover:line-clamp-none
          transition-all duration-200 delay-500 group-hover:delay-0">
          {event.title}
        </p>
        
        {/* Description - hidden, shows on hover with delayed close */}
        <div className="max-h-0 overflow-hidden opacity-0 
          group-hover:max-h-20 group-hover:opacity-100 
          transition-all duration-200 ease-out
          delay-500 group-hover:delay-0">
          <p className="text-[9px] text-muted-foreground leading-snug mt-1.5 line-clamp-3">
            {event.description}
          </p>
          
          {/* Participants */}
          {event.participants.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {event.participants.slice(0, 3).map((p, i) => (
                <span key={i} className="text-[8px] px-1 py-0.5 bg-background/50 rounded">@{p}</span>
              ))}
              {event.participants.length > 3 && (
                <span className="text-[8px] text-foreground/70 dark:text-foreground/80">+{event.participants.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Compact date marker for mini timeline
 */
function CompactDateMarker({ date, messageCount }: { date: string; messageCount?: number }) {
  const d = new Date(date + 'T12:00:00')
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  
  const diffDays = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  
  const day = d.getDate()
  const month = d.toLocaleDateString('de-DE', { month: 'short' })
  
  let relativeLabel = ''
  if (diffDays === 0) relativeLabel = 'HEUTE'
  else if (diffDays === 1) relativeLabel = 'GESTERN'
  
  const isToday = diffDays === 0
  
  return (
    <div className="flex flex-col items-center mx-2 min-w-[50px]">
      <div className={`px-2 py-1 rounded text-center ${
        isToday ? 'bg-primary/20 border border-primary/40' : 'bg-muted/50'
      }`}>
        {relativeLabel ? (
          <div className={`text-[8px] font-bold uppercase tracking-wider ${
            isToday ? 'text-primary' : 'text-muted-foreground'
          }`}>
            {relativeLabel}
          </div>
        ) : null}
        <div className={`text-sm font-bold font-mono leading-none ${
          isToday ? 'text-primary' : 'text-foreground'
        }`}>
          {day} {month}
        </div>
        {messageCount && (
          <div className="text-[8px] text-foreground/60 dark:text-foreground/70">
            {messageCount} msgs
          </div>
        )}
      </div>
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
          <div className="text-[9px] text-foreground/60 dark:text-foreground/70 mt-1 pt-1 border-t border-foreground/20">
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
 * Format time ago in German - short version
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
 * Format time ago with detailed breakdown (e.g., "1d 4h 5m ago")
 */
function formatDetailedTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  if (diffMins < 1) return 'just now'
  
  const days = diffDays
  const hours = diffHours % 24
  const mins = diffMins % 60
  
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (mins > 0 && days === 0) parts.push(`${mins}m`) // Only show mins if less than a day
  
  return parts.length > 0 ? `${parts.join(' ')} ago` : 'just now'
}

/**
 * Main Chat History Timeline Component
 */
export function ChatHistoryTimeline({ 
  className = '',
  title = 'Chat-Chronik',
  autoStart = false,
  showRefreshButton = true,
  compact = false,
  defaultMode = '24h'
}: ChatHistoryTimelineProps) {
  const [events, setEvents] = useState<ChatEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [cacheInfo, setCacheInfo] = useState<{ updatedAt: string; summary?: string; activityLevel?: string } | null>(null)
  const [mode, setMode] = useState<TimelineMode>(defaultMode)
  
  // Activity data
  const [activityBuckets, setActivityBuckets] = useState<ActivityBucket[]>([])
  const [activityStats, setActivityStats] = useState<ActivityStats | null>(null)
  const [isLoadingActivity, setIsLoadingActivity] = useState(false)
  
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
  
  // Auto-scroll to the right (newest events) after loading
  useEffect(() => {
    if (hasLoaded && events.length > 0 && scrollRef.current && compact) {
      // Small delay to ensure rendering is complete
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
        }
      }, 100)
    }
  }, [hasLoaded, events.length, compact])
  
  // Scroll handlers
  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -350 : 350,
      behavior: 'smooth'
    })
  }

  // Load activity data
  const loadActivity = useCallback(async () => {
    if (isLoadingActivity) return
    
    setIsLoadingActivity(true)
    
    try {
      const res = await fetch(`/test-timeline/api/activity?mode=${mode}&_t=${Date.now()}`)
      if (!res.ok) throw new Error('Failed to load activity')
      
      const data = await res.json()
      setActivityBuckets(data.buckets || [])
      setActivityStats(data.stats || null)
    } catch (err) {
      console.error('[Timeline] Activity load error:', err)
    } finally {
      setIsLoadingActivity(false)
    }
  }, [isLoadingActivity, mode])

  // Refresh timeline - AI-powered extraction of chat highlights
  const refreshTimeline = useCallback(async () => {
    if (isRefreshing) return // Prevent duplicate calls
    
    setIsRefreshing(true)
    setError(null)
    
    try {
      console.log(`[ChatTimeline] Generating AI timeline (${mode})...`)
      
      // Call AI endpoint directly for fresh analysis
      const res = await fetch('/test-timeline/api/analyze', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
        cache: 'no-store'
      })
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'AI analysis failed')
      }
      
      // Parse JSON response (non-streaming now)
      interface AIResponse {
        events?: AITimelineEvent[]
        summary?: string
        activityLevel?: 'low' | 'medium' | 'high'
        dominantSentiment?: string
      }
      
      const data: AIResponse = await res.json()
      
      if (!data?.events || data.events.length === 0) {
        console.warn('[ChatTimeline] No events in AI response, using empty state')
        setEvents([])
        setCacheInfo({ 
          updatedAt: new Date().toISOString(),
          summary: 'Keine besonderen Events gefunden',
          activityLevel: 'low'
        })
        setHasLoaded(true)
        return
      }
      
      // Map AI response to our ChatEvent format
      const mappedEvents: ChatEvent[] = data.events.map((evt, idx) => ({
        id: `ai-${mode}-${idx}`,
        date: evt.date || new Date().toISOString().split('T')[0],
        time: evt.time || '12:00',
        title: evt.title || 'Event',
        description: evt.quote 
          ? `*"${evt.quote}"* — @${evt.quoteAuthor || 'User'}\n\n${evt.description || ''}`
          : evt.description || '',
        type: evt.type || 'discussion',
        participants: evt.participants || [],
        quote: evt.quote,
        quoteAuthor: evt.quoteAuthor,
      }))
      
      setEvents(mappedEvents)
      setCacheInfo({ 
        updatedAt: new Date().toISOString(),
        summary: data.summary,
        activityLevel: data.activityLevel
      })
      setHasLoaded(true)
      console.log(`[ChatTimeline] ✅ Generated ${mappedEvents.length} events (${data.activityLevel || 'unknown'})`)
      
    } catch (err) {
      console.error('[ChatTimeline] Refresh error:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Aktualisieren')
      setHasLoaded(true)
    } finally {
      setIsRefreshing(false)
    }
  }, [isRefreshing, mode])

  // Load timeline from cache (with automatic refresh if expired/stale)
  const loadTimeline = useCallback(async () => {
    if (isLoading || isRefreshing) return // Prevent duplicate calls
    
    setIsLoading(true)
    setError(null)
    
    try {
      // Try to get from cache first (new AI endpoint)
      const cacheRes = await fetch(`/test-timeline/api/analyze?mode=${mode}&_t=${Date.now()}`, {
        cache: 'no-store'
      })
      
      if (cacheRes.ok) {
        const cacheData: CacheResponse = await cacheRes.json()
        
        if (cacheData.cached && cacheData.events && cacheData.events.length > 0) {
          // Check if cache is from today (for 24h mode)
          const cacheDate = new Date(cacheData.updatedAt).toDateString()
          const today = new Date().toDateString()
          const isCacheFromToday = cacheDate === today
          
          // Show cached data immediately
          setEvents(cacheData.events)
          setCacheInfo({ 
            updatedAt: cacheData.updatedAt,
            summary: cacheData.metadata?.summary,
            activityLevel: cacheData.metadata?.activityLevel
          })
          setHasLoaded(true)
          
          const ageInfo = cacheData.cacheAgeMinutes ? ` (${cacheData.cacheAgeMinutes}min alt)` : ''
          console.log(`[ChatTimeline] Loaded from cache: ${cacheData.eventCount} events${ageInfo}`)
          
          // Check if cache needs refresh
          if (cacheData.expired) {
            // Cache too old (>4h) - must refresh
            console.log('[ChatTimeline] ⚠️ Cache expired (>4h), auto-refreshing...')
            setIsLoading(false)
            setTimeout(() => refreshTimeline(), 100)
            return
          } else if (cacheData.stale) {
            // Cache stale (>30min) - refresh in background
            console.log('[ChatTimeline] 📊 Cache stale, background refresh...')
            setIsLoading(false)
            setTimeout(() => refreshTimeline(), 500)
            return
          } else if (mode === '24h' && !isCacheFromToday) {
            // 24h mode but cache is not from today - refresh
            console.log('[ChatTimeline] 📅 24h cache not from today, auto-refreshing...')
            setIsLoading(false)
            setTimeout(() => refreshTimeline(), 100)
            return
          }
        } else {
          // No cache or empty, generate new
          console.log('[ChatTimeline] No cache found, generating...')
          setIsLoading(false)
          await refreshTimeline()
          return
        }
      } else if (cacheRes.status === 404) {
        // No cache, generate new
        console.log('[ChatTimeline] No cache found (404), generating...')
        setIsLoading(false)
        await refreshTimeline()
        return
      } else {
        throw new Error('Failed to load cache')
      }
      
    } catch (err) {
      console.error('[ChatTimeline] Error:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Laden')
      setHasLoaded(true)
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, isRefreshing, mode, refreshTimeline])

  // Auto-start if enabled (only once)
  const hasStartedRef = useRef(false)
  useEffect(() => {
    if (autoStart && !hasStartedRef.current && !hasLoaded) {
      hasStartedRef.current = true
      loadTimeline()
      loadActivity()
    }
  }, [autoStart, hasLoaded, loadTimeline, loadActivity])
  
  // Reload when mode changes
  const handleModeChange = useCallback((newMode: TimelineMode) => {
    if (newMode === mode) return
    setMode(newMode)
    setHasLoaded(false)
    setEvents([])
    setActivityBuckets([])
    // Will trigger reload via useEffect
  }, [mode])
  
  // Reload when mode changes after initial load
  useEffect(() => {
    if (hasStartedRef.current && !hasLoaded && !isLoading && !isRefreshing) {
      loadTimeline()
      loadActivity()
    }
  }, [mode, hasLoaded, isLoading, isRefreshing, loadTimeline, loadActivity])

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
  
  // Match events to activity buckets for positioning
  const eventsWithBuckets = events.map(event => {
    const eventDateTime = new Date(`${event.date}T${event.time}:00`)
    let closestBucket = activityBuckets[0]
    let minDiff = Infinity
    
    for (const bucket of activityBuckets) {
      const bucketTime = new Date(bucket.timestamp)
      const diff = Math.abs(eventDateTime.getTime() - bucketTime.getTime())
      if (diff < minDiff) {
        minDiff = diff
        closestBucket = bucket
      }
    }
    
    return { ...event, bucket: closestBucket }
  })
  
  // Get bar color based on intensity
  const getBarColor = (intensity: number): string => {
    if (intensity === 0) return 'hsl(var(--foreground) / 0.1)'
    if (intensity < 0.3) return 'hsl(160 84% 39% / 0.5)'
    if (intensity < 0.6) return 'hsl(160 84% 39% / 0.7)'
    if (intensity < 0.8) return 'hsl(38 92% 50% / 0.8)'
    return 'hsl(24 95% 53% / 0.9)'
  }

  // ========== COMPACT MODE ==========
  if (compact) {
    return (
      <div className={`relative flex flex-col gap-2 ${className}`}>
        {/* Timeline events row */}
        <div className="flex items-center">
          {/* Left side: Mode selector, Refresh button and cache age */}
          <div className="flex-shrink-0 flex items-center gap-2 px-2 border-r border-foreground/10">
            {/* Mode selector - compact pills */}
            <div className="flex items-center gap-0.5 bg-muted/50 rounded p-0.5">
              {(['24h', '3d', '7d'] as TimelineMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => handleModeChange(m)}
                  disabled={isLoading || isRefreshing}
                  className={`px-1.5 py-0.5 text-[9px] font-medium rounded transition-all ${
                    mode === m 
                      ? 'bg-primary text-primary-foreground' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            
            {/* Refresh button */}
            <button
              onClick={refreshTimeline}
              disabled={isRefreshing || isLoading}
              className="p-1 rounded hover:bg-muted disabled:opacity-50 transition-all"
              title="Timeline aktualisieren"
            >
              <RefreshCw className={`w-3 h-3 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            
            {/* Cache age */}
            <div className="flex flex-col items-center">
              {cacheInfo && !isLoading && !isRefreshing && (
                <span className="text-[8px] text-foreground/60 dark:text-foreground/70 whitespace-nowrap leading-none">
                  {formatDetailedTimeAgo(cacheInfo.updatedAt)}
                </span>
              )}
              {(isLoading || isRefreshing) && (
                <span className="text-[8px] text-foreground/50 dark:text-foreground/60 whitespace-nowrap leading-none">
                  {isRefreshing ? 'AI...' : '...'}
                </span>
              )}
            </div>
          </div>

          {/* Right side: Timeline content */}
          <div className="flex-1 min-w-0 relative">
            {/* Compact: Loading */}
            {isLoading && !hasLoaded && (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Compact: Timeline with integrated activity bars */}
            {hasLoaded && events.length > 0 && activityBuckets.length > 0 && !isLoading && (
              <div className="relative">
                {/* Gradient overlays */}
                {canScrollLeft && (
                  <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent z-20 pointer-events-none" />
                )}
                {canScrollRight && (
                  <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent z-20 pointer-events-none" />
                )}
                
                {/* Scroll buttons */}
                {canScrollLeft && (
                  <button
                    onClick={() => scroll('left')}
                    className="absolute left-1 top-1/2 -translate-y-1/2 z-30 p-1 rounded-full bg-background/80 border border-foreground/10 hover:bg-muted transition-all"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                )}
                {canScrollRight && (
                  <button
                    onClick={() => scroll('right')}
                    className="absolute right-1 top-1/2 -translate-y-1/2 z-30 p-1 rounded-full bg-background/80 border border-foreground/10 hover:bg-muted transition-all"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
                
                {/* Scrollable container */}
                <div 
                  ref={scrollRef}
                  className="overflow-x-auto"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  <div className="relative min-w-max px-6 py-3 h-[280px]">
                    {/* Activity bars and timeline scale */}
                    <div className="absolute bottom-8 left-0 right-0 flex items-end gap-[2px] px-6">
                      {(() => {
                        // Reset event index at the start of each day
                        let currentDay = ''
                        let dayEventIndex = 0
                        
                        return activityBuckets.map((bucket, idx) => {
                          const maxCount = activityStats?.maxPerBucket || Math.max(...activityBuckets.map(b => b.count), 1)
                          const heightPercent = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0
                          const barHeight = bucket.count > 0 
                            ? Math.max(4, (heightPercent / 100) * 50)
                            : 4
                          
                          // Check if we're on a new day - reset counter
                          const bucketDate = new Date(bucket.timestamp).toDateString()
                          if (bucketDate !== currentDay) {
                            currentDay = bucketDate
                            dayEventIndex = 0 // Reset at day boundary
                          }
                          
                          // Find events for this bucket
                          const bucketEvents = eventsWithBuckets.filter(e => e.bucket?.timestamp === bucket.timestamp)
                          
                          return (
                            <div key={idx} className="relative flex flex-col items-center group" style={{ minWidth: '22px' }}>
                              {/* Event cards above the bar - STAGGERED PER DAY */}
                              {bucketEvents.map((event, eventIdx) => {
                                const style = getEventStyle(event.type)
                                const Icon = style.icon
                                const cardHeight = 52 // Card height including content
                                const verticalOffset = dayEventIndex * (cardHeight + 8) // Good spacing between cards
                                dayEventIndex++ // Increment for next event in this day
                                
                                return (
                                  <div 
                                    key={`${idx}-${event.id}-${eventIdx}`}
                                    className="absolute left-1/2 -translate-x-1/2 z-10 hover:z-[100] group/card" 
                                    style={{ 
                                      bottom: `${barHeight + 10 + verticalOffset}px`,
                                    }}
                                  >
                                    {/* Connector line from card to bar */}
                                    <div 
                                      className="absolute top-full left-1/2 -translate-x-1/2 w-px bg-gradient-to-b from-foreground/30 to-transparent" 
                                      style={{ 
                                        height: `${10 + verticalOffset}px`,
                                      }}
                                    />
                                    
                                    {/* Event card - with min width to prevent overflow */}
                                    <div 
                                      className={`w-36 p-1.5 rounded border ${style.bg} ${style.border} backdrop-blur-sm 
                                      transition-all duration-200 group-hover/card:w-44 group-hover/card:shadow-2xl group-hover/card:scale-105 cursor-default 
                                      will-change-[width,transform]`}
                                      style={{ minWidth: '144px' }}
                                    >
                                      <div className="flex items-center justify-between mb-0.5">
                                        <span className={`text-[7px] font-bold uppercase ${style.text} leading-none`}>
                                          {style.label}
                                        </span>
                                        <span className="text-[8px] font-mono text-muted-foreground">
                                          {event.time}
                                        </span>
                                      </div>
                                      <h4 className="text-[9px] font-bold leading-tight line-clamp-2 group-hover:line-clamp-3">
                                        {event.title}
                                      </h4>
                                      <p className="text-[8px] text-muted-foreground leading-snug mt-0.5 max-h-0 overflow-hidden opacity-0 group-hover:max-h-20 group-hover:opacity-100 transition-all duration-200 line-clamp-2">
                                        {event.description}
                                      </p>
                                    </div>
                                    
                                    {/* Dot at connection point */}
                                    <div 
                                      className={`absolute top-full left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${style.bg} border ${style.border} z-10`}
                                    />
                                  </div>
                                )
                              })}
                              
                              {/* Activity bar */}
                              <div 
                                className="w-5 rounded-t transition-all duration-100 group-hover:brightness-125"
                                style={{ 
                                  height: `${barHeight}px`,
                                  backgroundColor: getBarColor(bucket.intensity)
                                }}
                              />
                              
                              {/* Tooltip on hover */}
                              <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 
                                transition-opacity duration-100 pointer-events-none z-50 whitespace-nowrap">
                                <div className="bg-popover/95 backdrop-blur border border-border rounded px-1.5 py-0.5 text-[8px]">
                                  <span className="font-mono">{bucket.label}</span>
                                  <span className="text-muted-foreground ml-1">{bucket.count} msgs</span>
                                </div>
                              </div>
                            </div>
                          )
                        })
                      })()}
                    </div>
                    
                    {/* Time scale - BELOW the bars */}
                    <div className="absolute bottom-0 left-0 right-0 h-10 gap-[2px] px-6 border-t border-foreground/5 pt-1">
                      <div className="flex items-start gap-[2px]">
                        {activityBuckets.map((bucket, idx) => {
                          const bucketDate = new Date(bucket.timestamp)
                          const prevBucket = idx > 0 ? activityBuckets[idx - 1] : null
                          const prevDate = prevBucket ? new Date(prevBucket.timestamp) : null
                          
                          // Check if this is a new day
                          const isNewDay = !prevDate || bucketDate.toDateString() !== prevDate.toDateString()
                          
                          // Get day abbreviation (German)
                          const dayNames = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA']
                          const dayAbbr = dayNames[bucketDate.getDay()]
                          const dayAndMonth = `${dayAbbr} ${bucketDate.getDate()}.${bucketDate.getMonth() + 1}`
                          
                          return (
                            <div key={idx} className="relative flex flex-col items-center" style={{ minWidth: '22px' }}>
                              {/* Day marker at day boundaries */}
                              {isNewDay && (
                                <div className="text-[9px] font-bold text-foreground mb-0.5 whitespace-nowrap">
                                  {dayAndMonth}
                                </div>
                              )}
                              
                              {/* Time label every 6 buckets */}
                              {idx % 6 === 0 && (
                                <div className="text-[7px] text-muted-foreground/70 font-mono whitespace-nowrap">
                                  {bucket.label.split(' ').pop()}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Compact: Empty state - just show nothing or minimal text */}
            {hasLoaded && events.length === 0 && !isLoading && !error && (
              <div className="flex items-center justify-center py-3 text-[10px] text-foreground/50 dark:text-foreground/60">
                Keine Chat-Events
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ========== FULL MODE ==========
  return (
    <div className={`relative ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="font-headline text-lg font-bold flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-400" />
            {title}
          </h3>
          
          {/* Mode selector */}
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
            {(['24h', '3d', '7d'] as TimelineMode[]).map((m) => (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                disabled={isLoading || isRefreshing}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  mode === m 
                    ? 'bg-primary text-primary-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {m === '24h' ? '24h' : m === '3d' ? '3 Tage' : '7 Tage'}
              </button>
            ))}
          </div>
          
          {/* Cache info */}
          {cacheInfo && !isLoading && !isRefreshing && (
            <span className="text-[10px] text-foreground/60 dark:text-foreground/70">
              {formatTimeAgo(cacheInfo.updatedAt)}
              {cacheInfo.activityLevel && (
                <span className={`ml-2 ${
                  cacheInfo.activityLevel === 'high' ? 'text-emerald-500' :
                  cacheInfo.activityLevel === 'medium' ? 'text-amber-500' : 'text-muted-foreground'
                }`}>
                  • {cacheInfo.activityLevel === 'high' ? '🔥' : cacheInfo.activityLevel === 'medium' ? '📊' : '😴'}
                </span>
              )}
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
              title="Timeline aktualisieren (AI)"
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
          <MessageSquare className="w-12 h-12 text-foreground/30 dark:text-foreground/40 mb-4" />
          <p className="text-foreground/70 dark:text-foreground/80 mb-2">Chat-Chronik</p>
          <p className="text-sm text-foreground/60 dark:text-foreground/70 max-w-sm">
            Zeigt wichtige Momente und Diskussionen aus dem TradingView-Chat der letzten Tage.
          </p>
        </div>
      )}

      {/* Timeline content */}
      {hasLoaded && events.length > 0 && !isLoading && (
        <>
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
                              key={`${date}-${event.id}-${idx}`}
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
            <p className="text-center text-[10px] text-foreground/60 dark:text-foreground/70 mt-2">
              Heute ← Scrolle für ältere Events →
            </p>
          </div>
        </>
      )}

      {/* Empty loaded state */}
      {hasLoaded && events.length === 0 && !isLoading && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MessageSquare className="w-8 h-8 text-foreground/30 dark:text-foreground/40 mb-3" />
          <p className="text-sm text-foreground/70 dark:text-foreground/80">Keine Chat-Events gefunden</p>
          <p className="text-xs text-foreground/60 dark:text-foreground/70 mt-1">
            Generiere zuerst Zeitungen für mehrere Tage
          </p>
        </div>
      )}
    </div>
  )
}

