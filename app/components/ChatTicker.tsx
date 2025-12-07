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
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { TrendingUp, TrendingDown, Laugh, Zap, MessageSquare, AlertTriangle, RefreshCw } from 'lucide-react'

// Event types
type TickerEventType = 'bullish' | 'bearish' | 'funny' | 'drama' | 'insight' | 'call' | 'fail'

interface TickerEvent {
  id: string
  date: string // YYYY-MM-DD format
  time: string
  username: string
  text: string
  type: TickerEventType
  emoji?: string
}

interface ChatTickerProps {
  className?: string
  speed?: 'slow' | 'normal' | 'fast'
  autoStart?: boolean
}

// Style config for event types
const eventStyles: Record<TickerEventType, { 
  bg: string
  text: string
  border: string
  icon: typeof TrendingUp
  emoji: string
}> = {
  bullish: {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-400',
    border: 'border-emerald-500/50',
    icon: TrendingUp,
    emoji: '🚀'
  },
  bearish: {
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    border: 'border-red-500/50',
    icon: TrendingDown,
    emoji: '📉'
  },
  funny: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-400',
    border: 'border-amber-500/50',
    icon: Laugh,
    emoji: '😂'
  },
  drama: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-400',
    border: 'border-purple-500/50',
    icon: AlertTriangle,
    emoji: '🍿'
  },
  insight: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    border: 'border-blue-500/50',
    icon: Zap,
    emoji: '💡'
  },
  call: {
    bg: 'bg-cyan-500/20',
    text: 'text-cyan-400',
    border: 'border-cyan-500/50',
    icon: MessageSquare,
    emoji: '📢'
  },
  fail: {
    bg: 'bg-orange-500/20',
    text: 'text-orange-400',
    border: 'border-orange-500/50',
    icon: AlertTriangle,
    emoji: '💀'
  }
}

// Speed settings (pixels per second)
const speedSettings = {
  slow: 30,
  normal: 50,
  fast: 80
}

/**
 * Convert YYYY-MM-DD date to relative German label
 */
function getRelativeDate(dateStr: string): string {
  const eventDate = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  
  const diffMs = today.getTime() - eventDate.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'heute'
  if (diffDays === 1) return 'gestern'
  if (diffDays === 2) return 'vorgestern'
  
  // For older dates, show the weekday
  const weekdays = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
  return weekdays[eventDate.getDay()]
}

/**
 * Single ticker item
 */
function TickerItem({ event }: { event: TickerEvent }) {
  const style = eventStyles[event.type]
  const Icon = style.icon
  const relativeDate = getRelativeDate(event.date)
  
  return (
    <div className={`
      inline-flex items-center gap-2 px-3 py-1.5 mx-2 rounded-full
      ${style.bg} ${style.border} border
      whitespace-nowrap
      transition-transform hover:scale-105
    `}>
      <span className="text-sm">{event.emoji || style.emoji}</span>
      <span className="text-[10px] font-mono text-muted-foreground">
        <span className="text-primary/80 font-semibold">{relativeDate}</span>
        <span className="mx-0.5 opacity-50">·</span>
        <span>{event.time}</span>
      </span>
      <span className={`text-xs font-bold ${style.text}`}>@{event.username}</span>
      <span className="text-xs text-foreground/90 max-w-[300px] truncate">
        {event.text}
      </span>
      <Icon className={`w-3 h-3 ${style.text} flex-shrink-0`} />
    </div>
  )
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
  
  // Fetch ticker events (GET for cached, POST for refresh)
  const fetchEvents = useCallback(async (forceRefresh = false) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const res = await fetch('/api/chat-ticker', {
        method: forceRefresh ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      })
      
      if (!res.ok) throw new Error('Failed to fetch ticker events')
      
      const data = await res.json()
      
      if (data.events && data.events.length > 0) {
        setEvents(data.events)
        setCacheInfo({
          updatedAt: data.updatedAt,
          stale: data.stale || false
        })
        console.log(`[Ticker] Loaded ${data.events.length} events (cached=${data.cached}, stale=${data.stale || false})`)
        
        // If cache is stale, trigger background refresh
        if (data.stale && !forceRefresh) {
          console.log('[Ticker] Cache stale, refreshing in background...')
          setTimeout(() => {
            fetch('/api/chat-ticker', { method: 'POST' })
              .then(r => r.json())
              .then(newData => {
                if (newData.events && newData.events.length > 0) {
                  setEvents(newData.events)
                  setCacheInfo({ updatedAt: newData.updatedAt, stale: false })
                  console.log('[Ticker] Background refresh complete')
                }
              })
              .catch(err => console.error('[Ticker] Background refresh failed:', err))
          }, 1000)
        }
      } else if (data.error) {
        throw new Error(data.error)
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
  
  if (error) {
    return (
      <div className={`bg-card/50 border border-primary/20 rounded-lg p-2 ${className}`}>
        <span className="text-xs text-muted-foreground">Ticker nicht verfügbar</span>
      </div>
    )
  }
  
  if (isLoading && events.length === 0) {
    return (
      <div className={`bg-card/50 border border-primary/20 rounded-lg p-2 flex items-center gap-2 ${className}`}>
        <RefreshCw className="w-3 h-3 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">Lade Ticker...</span>
      </div>
    )
  }
  
  if (events.length === 0) {
    return (
      <div className={`bg-card/50 border border-primary/20 rounded-lg p-2 ${className}`}>
        <button 
          onClick={() => fetchEvents()}
          className="text-xs text-primary hover:underline"
        >
          📺 Ticker starten
        </button>
      </div>
    )
  }
  
  return (
    <div 
      className={`relative overflow-hidden bg-gradient-to-r from-card via-card/95 to-card border-y border-primary/20 ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Live indicator */}
      <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center px-3 bg-gradient-to-r from-card via-card to-transparent">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-red-500/20 border border-red-500/50 rounded">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Live</span>
        </div>
      </div>
      
      {/* Gradient fade right */}
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-card to-transparent z-10 pointer-events-none" />
      
      {/* Scrolling content */}
      <div className="py-2 pl-20">
        <div 
          ref={tickerRef}
          className="inline-flex items-center"
          style={{ willChange: 'transform' }}
        >
          {/* Duplicate content for seamless loop */}
          {[...events, ...events].map((event, idx) => (
            <TickerItem key={`${event.id}-${idx}`} event={event} />
          ))}
        </div>
      </div>
      
      {/* Pause indicator */}
      {isPaused && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20">
          <span className="text-[10px] text-muted-foreground bg-card/90 px-2 py-0.5 rounded">
            ⏸️ Pausiert
          </span>
        </div>
      )}
      
      {/* Refresh button */}
      <button
        onClick={() => fetchEvents(true)}
        disabled={isLoading}
        className="absolute right-12 top-1/2 -translate-y-1/2 z-20 p-1 rounded hover:bg-muted/50 transition-colors"
        title="Ticker aktualisieren"
      >
        <RefreshCw className={`w-3 h-3 text-muted-foreground ${isLoading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  )
}

export default ChatTicker
