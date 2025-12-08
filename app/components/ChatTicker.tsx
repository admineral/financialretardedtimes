/**
 * ChatTicker.tsx
 * 
 * Börsen-style Ticker für Chat-Events der letzten 24h.
 * Scrollt horizontal von rechts nach links wie ein Nachrichtenticker.
 * 
 * Features:
 * - Live-Events aus dem Chat (cached in Supabase)
 * - Farbcodierte Kategorien (bullish/bearish/funny/drama)
 * - Smooth infinite scroll animation
 * - AI-kuratierte Highlights
 * - Relative Datumsanzeige (heute, gestern, vorgestern)
 * - Timeline-style cards with labels and descriptions
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { TrendingUp, TrendingDown, Laugh, Zap, MessageSquare, AlertTriangle, RefreshCw, Sparkles } from 'lucide-react'

// Event types
type TickerEventType = 'bullish' | 'bearish' | 'funny' | 'drama' | 'insight' | 'call' | 'fail'

interface TickerEvent {
  id: string
  date: string // YYYY-MM-DD format
  time: string
  username: string
  text: string // Short preview text
  type: TickerEventType
  emoji?: string
  label?: string // Short label like "BTC", "PUMP", etc.
  headline?: string // Funny/catchy headline from AI
  quote?: string // Full original quote (shown on hover)
  quoteAuthor?: string // Author of the quote if different from username
}

interface ChatTickerProps {
  className?: string
  speed?: 'slow' | 'normal' | 'fast'
  autoStart?: boolean
}

// Style config for event types - enhanced with labels
const eventStyles: Record<TickerEventType, { 
  bg: string
  text: string
  border: string
  icon: typeof TrendingUp
  emoji: string
  label: string
}> = {
  bullish: {
    bg: 'bg-emerald-500/15 dark:bg-emerald-400/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/40 dark:border-emerald-400/50',
    icon: TrendingUp,
    emoji: '🚀',
    label: 'PUMP'
  },
  bearish: {
    bg: 'bg-red-500/15 dark:bg-red-400/20',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-500/40 dark:border-red-400/50',
    icon: TrendingDown,
    emoji: '📉',
    label: 'DUMP'
  },
  funny: {
    bg: 'bg-amber-500/15 dark:bg-amber-400/20',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/40 dark:border-amber-400/50',
    icon: Laugh,
    emoji: '😂',
    label: 'LOL'
  },
  drama: {
    bg: 'bg-purple-500/15 dark:bg-purple-400/20',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-500/40 dark:border-purple-400/50',
    icon: AlertTriangle,
    emoji: '🍿',
    label: 'BEEF'
  },
  insight: {
    bg: 'bg-blue-500/15 dark:bg-blue-400/20',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/40 dark:border-blue-400/50',
    icon: Sparkles,
    emoji: '💡',
    label: 'AHA'
  },
  call: {
    bg: 'bg-cyan-500/15 dark:bg-cyan-400/20',
    text: 'text-cyan-600 dark:text-cyan-400',
    border: 'border-cyan-500/40 dark:border-cyan-400/50',
    icon: MessageSquare,
    emoji: '📢',
    label: 'CALL'
  },
  fail: {
    bg: 'bg-orange-500/15 dark:bg-orange-400/20',
    text: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-500/40 dark:border-orange-400/50',
    icon: AlertTriangle,
    emoji: '💀',
    label: 'REKT'
  }
}

// Speed settings (pixels per second)
const speedSettings = {
  slow: 30,
  normal: 50,
  fast: 80
}

/**
 * Get formatted date info
 */
function getDateInfo(dateStr: string): { relative: string; formatted: string; isToday: boolean } {
  const eventDate = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  
  const diffMs = today.getTime() - eventDate.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  const day = eventDate.getDate()
  const month = eventDate.toLocaleDateString('de-DE', { month: 'short' })
  const formatted = `${day} ${month}`
  
  if (diffDays === 0) return { relative: 'HEUTE', formatted, isToday: true }
  if (diffDays === 1) return { relative: 'GESTERN', formatted, isToday: false }
  if (diffDays === 2) return { relative: 'VORGESTERN', formatted, isToday: false }
  
  const weekdays = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA']
  return { relative: weekdays[eventDate.getDay()], formatted, isToday: false }
}

/**
 * Date separator in ticker
 */
function DateSeparator({ dateStr }: { dateStr: string }) {
  const { relative, formatted, isToday } = getDateInfo(dateStr)
  
  return (
    <div className={`
      inline-flex flex-col items-center justify-center mx-3 px-3 py-1.5 rounded-lg
      ${isToday 
        ? 'bg-primary/20 border border-primary/40' 
        : 'bg-muted/60 border border-foreground/10'
      }
      min-w-[70px]
    `}>
      <span className={`text-[9px] font-black tracking-wider ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
        {relative}
      </span>
      <span className={`text-sm font-bold font-mono leading-tight ${isToday ? 'text-primary' : 'text-foreground'}`}>
        {formatted}
      </span>
    </div>
  )
}

/**
 * Single ticker item - Timeline card style with hover expand
 */
function TickerItem({ event }: { event: TickerEvent }) {
  const style = eventStyles[event.type]
  const Icon = style.icon
  const displayLabel = event.label || style.label
  const quoteAuthor = event.quoteAuthor || event.username
  
  return (
    <div className={`
      group/card relative inline-flex flex-col gap-1 px-3 py-2 mx-1.5 rounded-lg
      ${style.bg} border ${style.border}
      backdrop-blur-sm
      min-w-[180px] max-w-[220px]
      hover:min-w-[280px] hover:max-w-[320px]
      transition-all duration-300 ease-out
      hover:shadow-xl hover:z-50
      cursor-default
    `}>
      {/* Top row: Label + Time */}
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[9px] font-black tracking-wider px-1.5 py-0.5 rounded ${style.bg} ${style.text} border ${style.border}`}>
          {displayLabel}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">
          {event.time}
        </span>
      </div>
      
      {/* Headline - funny/catchy title from AI */}
      {event.headline && (
        <p className={`text-[11px] font-bold leading-snug ${style.text}`}>
          {event.headline}
        </p>
      )}
      
      {/* Preview text - always visible */}
      <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2 group-hover/card:line-clamp-none transition-all duration-300">
        {event.text}
      </p>
      
      {/* Full quote - expands on hover */}
      {event.quote && (
        <div className="max-h-0 overflow-hidden opacity-0 group-hover/card:max-h-24 group-hover/card:opacity-100 transition-all duration-300 ease-out">
          <blockquote className={`mt-1.5 pt-1.5 border-t ${style.border} border-dashed`}>
            <p className="text-[10px] italic text-foreground/80 leading-snug">
              „{event.quote}"
            </p>
            <cite className="text-[9px] text-muted-foreground not-italic mt-0.5 block">
              — @{quoteAuthor}
            </cite>
          </blockquote>
        </div>
      )}
      
      {/* Username + Icon */}
      <div className="flex items-center gap-1.5 mt-0.5">
        <Icon className={`w-3 h-3 ${style.text} opacity-60`} />
        <span className="text-[9px] text-muted-foreground">@{event.username}</span>
      </div>
    </div>
  )
}

/**
 * Group events by date and insert date separators
 */
function groupEventsByDate(events: TickerEvent[]): (TickerEvent | { type: 'date-separator'; date: string })[] {
  const result: (TickerEvent | { type: 'date-separator'; date: string })[] = []
  let currentDate = ''
  
  // Sort events by date (newest first) then by time
  const sorted = [...events].sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date)
    if (dateCompare !== 0) return dateCompare
    return b.time.localeCompare(a.time)
  })
  
  for (const event of sorted) {
    if (event.date !== currentDate) {
      result.push({ type: 'date-separator', date: event.date })
      currentDate = event.date
    }
    result.push(event)
  }
  
  return result
}

/**
 * Main Ticker Component
 */
export function ChatTicker({ 
  className = '', 
  speed = 'normal',
  autoStart = true 
}: ChatTickerProps) {
  const [events, setEvents] = useState<TickerEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cacheInfo, setCacheInfo] = useState<{ updatedAt: string; stale: boolean } | null>(null)
  const tickerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number | null>(null)
  const positionRef = useRef(0)
  
  // Helper to parse streaming response with progressive updates
  const parseStreamingResponse = async (
    response: Response,
    onPartialUpdate: (events: TickerEvent[]) => void
  ): Promise<{ events: TickerEvent[] }> => {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')
    
    const decoder = new TextDecoder()
    let fullText = ''
    let lastEventCount = 0
    
    // Helper to add IDs to events
    const addIds = (events: Array<Omit<TickerEvent, 'id'>>): TickerEvent[] => 
      events.map((evt, idx) => ({
        ...evt,
        id: `${evt.date}-${evt.time?.replace(':', '')}-${idx}`
      } as TickerEvent))
    
    // Helper to try parsing partial events
    const tryParsePartial = (text: string): TickerEvent[] => {
      try {
        // Look for events array in the streaming JSON
        const eventsMatch = text.match(/"events"\s*:\s*\[([\s\S]*)/)?.[1]
        if (!eventsMatch) return []
        
        // Find complete event objects by tracking brackets
        let bracketCount = 0
        let lastCompleteIdx = -1
        let inString = false
        let escape = false
        
        for (let i = 0; i < eventsMatch.length; i++) {
          const char = eventsMatch[i]
          
          if (escape) { escape = false; continue }
          if (char === '\\') { escape = true; continue }
          if (char === '"' && !escape) { inString = !inString; continue }
          if (inString) continue
          
          if (char === '{') bracketCount++
          if (char === '}') {
            bracketCount--
            if (bracketCount === 0) lastCompleteIdx = i
          }
        }
        
        if (lastCompleteIdx > 0) {
          const completeEventsStr = '[' + eventsMatch.slice(0, lastCompleteIdx + 1) + ']'
          const partialEvents = JSON.parse(completeEventsStr)
          if (Array.isArray(partialEvents)) {
            return addIds(partialEvents)
          }
        }
      } catch {
        // Partial JSON not valid yet
      }
      return []
    }
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      fullText += decoder.decode(value, { stream: true })
      
      // Try to parse partial events and update UI progressively
      const partialEvents = tryParsePartial(fullText)
      if (partialEvents.length > lastEventCount) {
        console.log(`[Ticker] 🔄 Streaming: ${partialEvents.length} events`)
        onPartialUpdate(partialEvents)
        lastEventCount = partialEvents.length
      }
    }
    
    // Final parse
    try {
      const parsed = JSON.parse(fullText)
      const events = addIds(parsed.events || [])
      return { events }
    } catch {
      console.warn('[Ticker] Final parse error')
      return { events: tryParsePartial(fullText) }
    }
  }

  // Fetch ticker events (GET for cached, POST for refresh with streaming)
  const fetchEvents = useCallback(async (forceRefresh = false) => {
    setIsLoading(true)
    setError(null)
    
    try {
      // First try GET for cached data
      if (!forceRefresh) {
        const res = await fetch('/api/chat-ticker', {
          method: 'GET',
          cache: 'no-store'
        })
        
        if (!res.ok) throw new Error('Failed to fetch ticker events')
        
        const data = await res.json()
        
        // If we have cached events, use them
        if (data.events && data.events.length > 0) {
          setEvents(data.events)
          setCacheInfo({
            updatedAt: data.updatedAt,
            stale: data.stale || false
          })
          console.log(`[Ticker] Loaded ${data.events.length} events (cached=${data.cached}, stale=${data.stale || false})`)
          
          // If cache is stale, trigger background refresh (streaming)
          if (data.stale) {
            console.log('[Ticker] Cache stale, streaming refresh in background...')
            setTimeout(() => fetchEvents(true), 1000)
          }
          
          setIsLoading(false)
          return
        }
        
        // No cache, need to generate
        if (data.needsGeneration) {
          console.log('[Ticker] No cache, triggering generation...')
          // Fall through to POST
        } else if (data.error) {
          throw new Error(data.error)
        }
      }
      
      // POST for streaming generation
      console.log('[Ticker] Starting streaming generation...')
      const postRes = await fetch('/api/chat-ticker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      })
      
      if (!postRes.ok) throw new Error('Failed to generate ticker events')
      
      // Parse streaming response with progressive UI updates
      const { events: newEvents } = await parseStreamingResponse(
        postRes,
        // Callback for each partial update - show events as they arrive!
        (partialEvents) => {
          setEvents(partialEvents)
        }
      )
      
      if (newEvents.length > 0) {
        setEvents(newEvents)
        setCacheInfo({ updatedAt: new Date().toISOString(), stale: false })
        console.log(`[Ticker] ✅ Streaming complete: ${newEvents.length} events`)
      }
      
    } catch (err) {
      console.error('[Ticker] Error:', err)
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setIsLoading(false)
    }
  }, [])
  
  // Animation loop
  useEffect(() => {
    if (events.length === 0 || isPaused) return
    
    const ticker = tickerRef.current
    if (!ticker) return
    
    const pixelsPerSecond = speedSettings[speed]
    let lastTime = performance.now()
    
    const animate = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 1000
      lastTime = currentTime
      
      positionRef.current -= pixelsPerSecond * deltaTime
      
      // Reset when scrolled past content
      const contentWidth = ticker.scrollWidth / 2
      if (Math.abs(positionRef.current) >= contentWidth) {
        positionRef.current = 0
      }
      
      ticker.style.transform = `translateX(${positionRef.current}px)`
      animationRef.current = requestAnimationFrame(animate)
    }
    
    animationRef.current = requestAnimationFrame(animate)
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [events, isPaused, speed])
  
  // Auto-start
  useEffect(() => {
    if (autoStart && events.length === 0 && !isLoading) {
      fetchEvents()
    }
  }, [autoStart, events.length, isLoading, fetchEvents])
  
  // Pause on hover
  const handleMouseEnter = () => setIsPaused(true)
  const handleMouseLeave = () => setIsPaused(false)
  
  // Group events with date separators
  const groupedItems = groupEventsByDate(events)
  
  if (error) {
    return (
      <div className={`bg-card/50 border border-foreground/10 rounded-lg p-3 ${className}`}>
        <span className="text-xs text-muted-foreground">Ticker nicht verfügbar</span>
      </div>
    )
  }
  
  if (isLoading && events.length === 0) {
    return (
      <div className={`bg-card/50 border border-foreground/10 rounded-lg p-3 flex items-center gap-2 ${className}`}>
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">Lade Timeline...</span>
      </div>
    )
  }
  
  if (events.length === 0) {
    return (
      <div className={`bg-card/50 border border-foreground/10 rounded-lg p-3 ${className}`}>
        <button 
          onClick={() => fetchEvents()}
          className="text-xs text-primary hover:underline flex items-center gap-1.5"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chat-Timeline starten
        </button>
      </div>
    )
  }
  
  return (
    <div 
      className={`relative overflow-hidden bg-gradient-to-r from-card/80 via-card to-card/80 border border-foreground/10 rounded-lg ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Live indicator */}
      <div className="absolute left-0 top-0 bottom-0 z-20 flex items-center px-2 bg-gradient-to-r from-card via-card/95 to-transparent">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-red-500/15 dark:bg-red-500/20 border border-red-500/30 rounded-md">
          <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
          <span className="text-[9px] font-bold text-red-500 dark:text-red-400 uppercase tracking-wider">Live</span>
        </div>
      </div>
      
      {/* Gradient fade right */}
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-card to-transparent z-10 pointer-events-none" />
      
      {/* Scrolling content */}
      <div className="py-2.5 pl-[72px]">
        <div 
          ref={tickerRef}
          className="inline-flex items-stretch"
          style={{ willChange: 'transform' }}
        >
          {/* Duplicate content for seamless loop */}
          {[...groupedItems, ...groupedItems].map((item, idx) => (
            'type' in item && item.type === 'date-separator' ? (
              <DateSeparator key={`sep-${item.date}-${idx}`} dateStr={item.date} />
            ) : (
              <TickerItem key={`evt-${(item as TickerEvent).id}-${idx}`} event={item as TickerEvent} />
            )
          ))}
        </div>
      </div>
      
      {/* Pause indicator */}
      {isPaused && (
        <div className="absolute right-14 top-1/2 -translate-y-1/2 z-20">
          <span className="text-[9px] text-muted-foreground bg-card/95 backdrop-blur px-2 py-1 rounded-md border border-foreground/10">
            ⏸️ Pausiert
          </span>
        </div>
      )}
      
      {/* Refresh button */}
      <button
        onClick={() => fetchEvents(true)}
        disabled={isLoading}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-1.5 rounded-md hover:bg-muted/50 transition-colors border border-transparent hover:border-foreground/10"
        title="Timeline aktualisieren"
      >
        <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isLoading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  )
}

export default ChatTicker
