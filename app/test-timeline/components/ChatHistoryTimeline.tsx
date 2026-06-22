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

import { AlertTriangle,ChevronLeft,ChevronRight,Loader2,MessageSquare,RefreshCw,Sparkles,TrendingUp,Users,Zap } from 'lucide-react'
import { useCallback,useEffect,useMemo,useRef,useState } from 'react'
import { createPortal } from 'react-dom'

const CHAT_EVENT_TYPES = ['discussion', 'prediction', 'drama', 'insight', 'milestone', 'humor'] as const

// Event types for chat moments
type ChatEventType = typeof CHAT_EVENT_TYPES[number]

function normalizeChatEventType(type: ChatEventType | string | null | undefined): ChatEventType {
  if (!type) return 'discussion'

  const lower = type.toLowerCase().trim()
  if ((CHAT_EVENT_TYPES as readonly string[]).includes(lower)) return lower as ChatEventType
  if (lower.includes('discuss') || lower.includes('chat') || lower.includes('debate')) return 'discussion'
  if (lower.includes('predict') || lower.includes('prognose') || lower.includes('call')) return 'prediction'
  if (lower.includes('drama') || lower.includes('streit') || lower.includes('beef') || lower.includes('conflict')) return 'drama'
  if (lower.includes('insight') || lower.includes('erkenntnis') || lower.includes('analyse')) return 'insight'
  if (lower.includes('mile') || lower.includes('meilenstein')) return 'milestone'
  if (lower.includes('humor') || lower.includes('witz') || lower.includes('lol') || lower.includes('meme')) return 'humor'
  return 'discussion'
}

interface ChatEvent {
  id: string
  date: string
  time: string // HH:MM format
  label?: string // Short label from AI (e.g. "BTC", "LOL", "PUMP")
  title: string
  description: string
  type: ChatEventType
  participants: string[]
  messageCount?: number
  quote?: string | null
  quoteAuthor?: string | null
}

// AI Response event format (from /test-timeline/api/analyze)
interface AITimelineEvent {
  timestamp?: string
  time?: string
  date?: string
  label?: string // Short label from AI (e.g. "BTC", "LOL", "PUMP")
  title?: string
  quote?: string
  quoteAuthor?: string
  description?: string
  type?: string // Now string from API, will be parsed to ChatEventType
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
  mini?: boolean // Ultra-minimal one-liner, expands on hover
  defaultMode?: TimelineMode // Default: '3d'
  cacheRefreshKey?: number
  controlledEvents?: ChatEvent[]
  controlledActivityBuckets?: ActivityBucket[]
  controlledActivityStats?: ActivityStats | null
  controlledCacheInfo?: { updatedAt: string; summary?: string; activityLevel?: string } | null
  disableAutoFetch?: boolean
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
  expired?: boolean  // Cache older than 12 hours - must refresh
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

/**
 * Parse BBCode quotes and extract structured data
 * Returns { quotedUser, quotedText, responseText } or null if no quote found
 */
function parseBBCodeQuote(text: string): { quotedUser: string; quotedText: string; responseText: string } | null {
  const bbcodeRegex = /\[quote="([^"]+)"\]([\s\S]*?)\[\/quote\]\s*([\s\S]*)/
  const match = text.match(bbcodeRegex)
  
  if (match) {
    return {
      quotedUser: match[1],
      quotedText: match[2].trim(),
      responseText: match[3].trim()
    }
  }
  return null
}

/**
 * Render a quote field that may contain BBCode
 */
function renderQuoteContent(quote: string, quoteAuthor: string, style: { border: string }, compact = false) {
  const parsed = parseBBCodeQuote(quote)
  
  if (parsed) {
    // Has nested quote - show both
    if (compact) {
      return (
        <div className="space-y-1">
          <div className="text-[9px] text-blue-600 dark:text-blue-400">
            <span className="font-medium">@{parsed.quotedUser}:</span>{' '}
            <span className="italic text-muted-foreground">„{parsed.quotedText.slice(0, 50)}{parsed.quotedText.length > 50 ? '...' : ''}“</span>
          </div>
          {parsed.responseText && (
            <p className="text-[10px] text-foreground/80">
              {parsed.responseText}
            </p>
          )}
        </div>
      )
    }
    
    // Full version for modal
    return (
      <div className="space-y-2">
        {/* Nested quote */}
        <div className="border-l-4 border-blue-400/50 dark:border-blue-500/40 pl-3 py-2 bg-blue-50 dark:bg-blue-950/20 rounded-r-md">
          <div className="flex items-center gap-1 mb-1">
            <MessageSquare className="h-3 w-3 text-blue-500 dark:text-blue-400" />
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
              @{parsed.quotedUser}:
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-muted-foreground italic">
            „{parsed.quotedText}“
          </p>
        </div>
        {/* Response */}
        {parsed.responseText && (
          <p className="text-sm text-gray-700 dark:text-foreground/90">
            {parsed.responseText}
          </p>
        )}
      </div>
    )
  }
  
  // No nested quote, render as-is
  if (compact) {
    return (
      <p className="text-[10px] italic text-foreground/80 leading-snug">
        „{quote}“
      </p>
    )
  }
  
  return (
    <p className="text-sm text-gray-700 dark:text-inherit italic">
      „{quote}“
    </p>
  )
}

/**
 * Parse and render text that may contain quotes in various formats:
 * - BBCode: [quote="username"]quoted text[/quote]
 * - Markdown-style: *"quoted text"* — @username
 */
function renderTextWithQuotes(text: string, compact = false) {
  const parts: Array<{ type: 'text' | 'quote'; content: string; username?: string }> = []
  
  // First, try to parse BBCode-style quotes
  const bbcodeRegex = /\[quote="([^"]+)"\]([\s\S]*?)\[\/quote\]/g
  let hasBBCode = false
  let lastIndex = 0
  let match
  
  while ((match = bbcodeRegex.exec(text)) !== null) {
    hasBBCode = true
    // Add text before quote
    if (match.index > lastIndex) {
      const beforeText = text.slice(lastIndex, match.index).trim()
      if (beforeText) {
        parts.push({ type: 'text', content: beforeText })
      }
    }
    
    // Add quote
    parts.push({
      type: 'quote',
      username: match[1],
      content: match[2].trim()
    })
    
    lastIndex = match.index + match[0].length
  }
  
  if (hasBBCode) {
    // Add remaining text after last BBCode quote
    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex).trim()
      if (remainingText) {
        parts.push({ type: 'text', content: remainingText })
      }
    }
  } else {
    // Try markdown-style quotes: *"quoted text"* — @username
    const markdownQuoteRegex = /^\*"([^"]+)"\*\s*—\s*@(\S+)\s*/
    const mdMatch = text.match(markdownQuoteRegex)
    
    if (mdMatch) {
      parts.push({
        type: 'quote',
        content: mdMatch[1],
        username: mdMatch[2]
      })
      
      // Get remaining text after the quote
      const remaining = text.slice(mdMatch[0].length).trim()
      if (remaining) {
        parts.push({ type: 'text', content: remaining })
      }
    }
  }
  
  // If no quotes found, return original text
  if (parts.length === 0) {
    return <span>{text}</span>
  }
  
  if (compact) {
    // Compact version for cards - inline style
    return (
      <span>
        {parts.map((part, index) => {
          if (part.type === 'quote') {
            return (
              <span key={index} className="text-muted-foreground/70">
                <span className="text-blue-600 dark:text-blue-400 font-medium">@{part.username}:</span>{' '}
                <span className="italic">„{part.content}“</span>{' '}
              </span>
            )
          }
          return <span key={index}>{part.content} </span>
        })}
      </span>
    )
  }
  
  // Full version for modals - block style
  return (
    <div className="space-y-2">
      {parts.map((part, index) => {
        if (part.type === 'quote') {
          return (
            <div key={index} className="border-l-4 border-blue-400/50 dark:border-blue-500/40 pl-3 py-2 bg-blue-50 dark:bg-blue-950/20 rounded-r-md">
              <div className="flex items-center gap-1 mb-1">
                <MessageSquare className="h-3 w-3 text-blue-500 dark:text-blue-400" />
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  @{part.username}:
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-muted-foreground italic">
                „{part.content}“
              </p>
            </div>
          )
        }
        return <p key={index} className="text-sm text-gray-600 dark:text-muted-foreground">{part.content}</p>
      })}
    </div>
  )
}

// Get style for event type - High contrast colors for accessibility
function getEventStyle(type: ChatEventType | string | null | undefined) {
  switch (normalizeChatEventType(type)) {
    case 'discussion':
      return {
        icon: MessageSquare,
        bg: 'bg-blue-500/20 dark:bg-blue-400/20',
        border: 'border-blue-600 dark:border-blue-400',
        text: 'text-blue-700 dark:text-blue-300',
        label: 'TALK'
      }
    case 'prediction':
      return {
        icon: TrendingUp,
        bg: 'bg-emerald-500/20 dark:bg-emerald-400/20',
        border: 'border-emerald-600 dark:border-emerald-400',
        text: 'text-emerald-700 dark:text-emerald-300',
        label: 'CALL'
      }
    case 'drama':
      return {
        icon: AlertTriangle,
        bg: 'bg-red-500/20 dark:bg-red-400/20',
        border: 'border-red-600 dark:border-red-400',
        text: 'text-red-700 dark:text-red-300',
        label: 'BEEF'
      }
    case 'insight':
      return {
        icon: Sparkles,
        bg: 'bg-amber-500/20 dark:bg-amber-400/20',
        border: 'border-amber-600 dark:border-amber-400',
        text: 'text-amber-700 dark:text-amber-300',
        label: 'AHA'
      }
    case 'milestone':
      return {
        icon: Zap,
        bg: 'bg-purple-500/20 dark:bg-purple-400/20',
        border: 'border-purple-600 dark:border-purple-400',
        text: 'text-purple-700 dark:text-purple-300',
        label: 'BOOM'
      }
    case 'humor':
      return {
        icon: Users,
        bg: 'bg-pink-500/20 dark:bg-pink-400/20',
        border: 'border-pink-600 dark:border-pink-400',
        text: 'text-pink-700 dark:text-pink-300',
        label: 'LOL'
      }
  }
}



/**
 * Single event card on the timeline - compact with hover expand, click for modal
 */
function TimelineCard({ 
  event, 
  position 
}: { 
  event: ChatEvent
  position: 'top' | 'bottom'
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const style = getEventStyle(event.type)
  const Icon = style.icon
  
  // Use AI label or fall back to style label
  const displayLabel = event.label || style.label
  
  // Format date for display
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
  }
  
  return (
    <>
      <div className={`relative flex flex-col items-center ${position === 'top' ? 'mb-4' : 'mt-4'}`}>
        {/* Connector line */}
        <div className={`absolute ${position === 'top' ? 'bottom-0 translate-y-full' : 'top-0 -translate-y-full'} left-1/2 w-px h-8 ${style.bg}`} />
        
        {/* Card - compact, expands on hover, click for modal */}
        <div 
          onClick={() => setIsExpanded(true)}
          className={`group w-52 p-3 rounded-lg border ${style.bg} ${style.border} backdrop-blur-sm 
          transition-all duration-300 hover:w-72 hover:shadow-xl cursor-pointer select-none active:scale-95
          ${position === 'top' ? 'origin-bottom' : 'origin-top'}`}
        >
          {/* Header: Label badge + timestamp right */}
          <div className="flex items-start justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className={`text-[9px] font-black tracking-wide px-1.5 py-0.5 rounded ${style.bg} ${style.text} border ${style.border}`}>
                {displayLabel}
              </span>
              <Icon className={`w-3 h-3 ${style.text} opacity-60`} />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground/70">
              {event.time}
            </span>
          </div>
          
          {/* Title - always visible, full text */}
          <h4 className={`font-headline text-sm font-bold leading-tight ${style.text}`}>
            {event.title}
          </h4>
          
          {/* Description preview on hover */}
          <div className="max-h-0 overflow-hidden opacity-0 group-hover:max-h-12 group-hover:opacity-100 transition-all duration-300">
            <p className="text-[11px] text-muted-foreground leading-snug mt-2 line-clamp-2">
              {event.description?.slice(0, 80)}...
            </p>
          </div>
        </div>
        
        {/* Dot on timeline */}
        <div className={`absolute ${position === 'top' ? '-bottom-6' : '-top-6'} left-1/2 -translate-x-1/2 
          w-3 h-3 rounded-full ${style.bg} border-2 ${style.border} z-10`} />
      </div>
      
      {/* Modal overlay - rendered via portal to escape stacking context */}
      {isExpanded && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          style={{ zIndex: 99999 }}
          onClick={() => setIsExpanded(false)}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-md p-5 rounded-xl border-2 
              bg-white dark:bg-card ${style.border} shadow-2xl
              animate-in fade-in zoom-in-95 duration-200`}
          >
            {/* Close button */}
            <button 
              onClick={() => setIsExpanded(false)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full 
                bg-gray-100 dark:bg-background/50 hover:bg-gray-200 dark:hover:bg-background/80 transition-colors text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground"
            >
              ✕
            </button>
            
            {/* Header */}
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-sm font-black tracking-wide px-2 py-1 rounded ${style.bg} ${style.text} border ${style.border}`}>
                {displayLabel}
              </span>
              <Icon className={`w-5 h-5 ${style.text}`} />
              <span className="text-sm font-mono text-gray-500 dark:text-muted-foreground ml-auto">
                {formatDate(event.date)} • {event.time}
              </span>
            </div>
            
            {/* Title */}
            <h3 className={`text-lg font-bold leading-tight mb-3 ${style.text}`}>
              {event.title}
            </h3>
            
            {/* Quote if exists */}
            {event.quote && (
              <div className={`border-l-4 ${style.border} pl-3 mb-3`}>
                {renderQuoteContent(event.quote, event.quoteAuthor || '', style, false)}
                {event.quoteAuthor && (
                  <span className="block text-xs text-gray-500 dark:text-muted-foreground mt-2">— @{event.quoteAuthor}</span>
                )}
              </div>
            )}
            
            {/* Full description */}
            {event.description && (
              <div className="text-sm leading-relaxed mb-4">
                {renderTextWithQuotes(event.description, false)}
              </div>
            )}
            
            {/* Participants */}
            {event.participants.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-200 dark:border-border/50">
                <span className="text-xs text-gray-500 dark:text-muted-foreground">Beteiligt:</span>
                {event.participants.map((p, i) => (
                  <span key={i} className={`text-xs px-2 py-1 rounded ${style.bg} ${style.text}`}>
                    @{p}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

/**
 * Mini event card for mini timeline mode - very compact, expands details on hover
 */
function MiniEventCard({ 
  event, 
  style, 
  displayLabel, 
  cardWidth, 
  cardHeight,
  barHeight, 
  verticalOffset, 
  fontSize, 
  titleSize,
  isHovered: isTimelineHovered
}: { 
  event: ChatEvent & { bucket?: { timestamp: string; label: string; count: number; uniqueUsers: number; intensity: number } }
  style: ReturnType<typeof getEventStyle>
  displayLabel: string
  cardWidth: number
  cardHeight: number
  barHeight: number
  verticalOffset: number
  fontSize: string
  titleSize: string
  isHovered: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const Icon = style.icon
  
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
  }
  
  return (
    <>
      <div 
        className="absolute left-1/2 -translate-x-1/2 z-10 hover:z-[100] group/card transition-all duration-300" 
        style={{ 
          bottom: `${barHeight + (isTimelineHovered ? 6 : 3) + verticalOffset}px`,
        }}
      >
        {/* Connector line */}
        <div 
          className="absolute top-full left-1/2 -translate-x-1/2 w-px bg-gradient-to-b from-foreground/20 to-transparent transition-all duration-300" 
          style={{ height: `${(isTimelineHovered ? 6 : 3) + verticalOffset}px` }}
        />
        
        {/* Event card - mini version, expands on individual card hover */}
        <div 
          onClick={() => setIsExpanded(true)}
          className={`rounded border ${style.bg} ${style.border} backdrop-blur-sm 
          transition-all duration-200 hover:shadow-xl hover:z-[100] 
          cursor-pointer select-none active:scale-95 overflow-hidden
          group-hover/card:min-w-[180px] group-hover/card:w-auto group-hover/card:h-auto group-hover/card:max-h-none`}
          style={{ 
            width: `${cardWidth}px`,
            minWidth: `${cardWidth}px`,
            height: isTimelineHovered ? 'auto' : `${cardHeight}px`,
            maxHeight: isTimelineHovered ? 'none' : `${cardHeight}px`,
            padding: isTimelineHovered ? '6px' : '2px 3px',
          }}
        >
          {/* Header: label + time - show on timeline hover OR card hover */}
          <div className={`flex items-center justify-between gap-1 transition-all duration-200 ${
            isTimelineHovered ? 'opacity-100 max-h-6 mb-0.5' : 'opacity-0 max-h-0 mb-0 group-hover/card:opacity-100 group-hover/card:max-h-6 group-hover/card:mb-0.5'
          }`}>
            <span className={`text-${fontSize} font-black tracking-wide px-1 py-0.5 rounded ${style.bg} ${style.text} border ${style.border} leading-none`}>
              {displayLabel}
            </span>
            <span className={`text-${fontSize} font-mono text-muted-foreground/60`}>
              {event.time}
            </span>
          </div>
          
          {/* Title - always visible, expands on card hover */}
          <h4 className={`text-${titleSize} font-semibold leading-tight ${style.text} truncate group-hover/card:whitespace-normal group-hover/card:line-clamp-2`}>
            {event.title}
          </h4>
          
          {/* Description preview - shows on individual card hover */}
          <div className="max-h-0 overflow-hidden opacity-0 group-hover/card:max-h-16 group-hover/card:opacity-100 transition-all duration-200">
            <p className="text-[9px] text-foreground leading-snug mt-1 line-clamp-2">
              {event.description?.slice(0, 80)}...
            </p>
          </div>
        </div>
        
        {/* Dot */}
        <div className={`absolute top-full left-1/2 -translate-x-1/2 rounded-full ${style.bg} border ${style.border} z-10 transition-all duration-300`}
          style={{ width: isTimelineHovered ? '6px' : '4px', height: isTimelineHovered ? '6px' : '4px' }}
        />
      </div>
      
      {/* Modal */}
      {isExpanded && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          style={{ zIndex: 99999 }}
          onClick={() => setIsExpanded(false)}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-md p-5 rounded-xl border-2 
              bg-white dark:bg-card ${style.border} shadow-2xl
              animate-in fade-in zoom-in-95 duration-200`}
          >
            <button 
              onClick={() => setIsExpanded(false)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full 
                bg-gray-100 dark:bg-background/50 hover:bg-gray-200 dark:hover:bg-background/80 transition-colors"
            >
              ✕
            </button>
            
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-sm font-black tracking-wide px-2 py-1 rounded ${style.bg} ${style.text} border ${style.border}`}>
                {displayLabel}
              </span>
              <Icon className={`w-5 h-5 ${style.text}`} />
              <span className="text-sm font-mono text-gray-500 dark:text-muted-foreground ml-auto">
                {formatDate(event.date)} • {event.time}
              </span>
            </div>
            
            <h3 className={`text-lg font-bold leading-tight mb-3 ${style.text}`}>
              {event.title}
            </h3>
            
            {event.quote && (
              <div className={`border-l-4 ${style.border} pl-3 mb-3`}>
                {renderQuoteContent(event.quote, event.quoteAuthor || '', style, false)}
                {event.quoteAuthor && (
                  <span className="block text-xs text-gray-500 dark:text-muted-foreground mt-2">— @{event.quoteAuthor}</span>
                )}
              </div>
            )}
            
            {event.description && (
              <div className="text-sm leading-relaxed mb-4">
                {renderTextWithQuotes(event.description, false)}
              </div>
            )}
            
            {event.participants && event.participants.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-200 dark:border-border/50">
                <span className="text-xs text-gray-500 dark:text-muted-foreground">Beteiligt:</span>
                {event.participants.map((p, i) => (
                  <span key={i} className={`text-xs px-2 py-1 rounded ${style.bg} ${style.text}`}>
                    @{p}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

/**
 * Inline event card for compact timeline with click-to-expand modal
 */
function InlineEventCard({ 
  event, 
  style, 
  displayLabel, 
  cardWidth, 
  barHeight, 
  verticalOffset, 
  fontSize, 
  titleSize,
  isTiny 
}: { 
  event: ChatEvent & { bucket?: { timestamp: string; label: string; count: number; uniqueUsers: number; intensity: number } }
  style: ReturnType<typeof getEventStyle>
  displayLabel: string
  cardWidth: number
  barHeight: number
  verticalOffset: number
  fontSize: string
  titleSize: string
  isTiny: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const Icon = style.icon
  
  // Format date for display
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
  }
  
  return (
    <>
      <div 
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
        
        {/* Event card - clickable */}
        <div 
          onClick={() => setIsExpanded(true)}
          className={`p-2 rounded-lg border ${style.bg} ${style.border} backdrop-blur-sm 
          transition-all duration-200 hover:shadow-2xl hover:scale-105 hover:z-[100] 
          cursor-pointer select-none active:scale-95`}
          style={{ 
            width: `${cardWidth + 20}px`,
            minWidth: `${cardWidth + 20}px`,
          }}
        >
          {/* Header: Label badge + time top right */}
          <div className="flex items-start justify-between gap-1 mb-1">
            <span className={`text-${fontSize} font-black tracking-wide px-1 py-0.5 rounded ${style.bg} ${style.text} border ${style.border} leading-none`}>
              {displayLabel}
            </span>
            <span className={`text-${fontSize} font-mono text-muted-foreground/60`}>
              {event.time}
            </span>
          </div>
          
          {/* Title - full text, wraps */}
          <h4 className={`text-${titleSize} font-semibold leading-tight ${style.text}`}>
            {event.title}
          </h4>
          
          {/* Preview on hover */}
          {!isTiny && (
            <p className="text-[8px] text-muted-foreground leading-snug mt-1 max-h-0 overflow-hidden opacity-0 group-hover/card:max-h-8 group-hover/card:opacity-100 transition-all duration-200 line-clamp-2">
              {event.description?.slice(0, 60)}...
            </p>
          )}
        </div>
        
        {/* Dot at connection point */}
        <div 
          className={`absolute top-full left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${style.bg} border ${style.border} z-10`}
        />
      </div>
      
      {/* Modal overlay - rendered via portal to escape stacking context */}
      {isExpanded && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          style={{ zIndex: 99999 }}
          onClick={() => setIsExpanded(false)}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-md p-5 rounded-xl border-2 
              bg-white dark:bg-card ${style.border} shadow-2xl
              animate-in fade-in zoom-in-95 duration-200`}
          >
            {/* Close button */}
            <button 
              onClick={() => setIsExpanded(false)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full 
                bg-gray-100 dark:bg-background/50 hover:bg-gray-200 dark:hover:bg-background/80 transition-colors text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground"
            >
              ✕
            </button>
            
            {/* Header */}
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-sm font-black tracking-wide px-2 py-1 rounded ${style.bg} ${style.text} border ${style.border}`}>
                {displayLabel}
              </span>
              <Icon className={`w-5 h-5 ${style.text}`} />
              <span className="text-sm font-mono text-gray-500 dark:text-muted-foreground ml-auto">
                {formatDate(event.date)} • {event.time}
              </span>
            </div>
            
            {/* Title */}
            <h3 className={`text-lg font-bold leading-tight mb-3 ${style.text}`}>
              {event.title}
            </h3>
            
            {/* Quote if exists */}
            {event.quote && (
              <div className={`border-l-4 ${style.border} pl-3 mb-3`}>
                {renderQuoteContent(event.quote, event.quoteAuthor || '', style, false)}
                {event.quoteAuthor && (
                  <span className="block text-xs text-gray-500 dark:text-muted-foreground mt-2">— @{event.quoteAuthor}</span>
                )}
              </div>
            )}
            
            {/* Full description */}
            {event.description && (
              <div className="text-sm leading-relaxed mb-4">
                {renderTextWithQuotes(event.description, false)}
              </div>
            )}
            
            {/* Participants */}
            {event.participants && event.participants.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-200 dark:border-border/50">
                <span className="text-xs text-gray-500 dark:text-muted-foreground">Beteiligt:</span>
                {event.participants.map((p, i) => (
                  <span key={i} className={`text-xs px-2 py-1 rounded ${style.bg} ${style.text}`}>
                    @{p}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
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
  mini = false,
  defaultMode = '3d',
  cacheRefreshKey = 0,
  controlledEvents,
  controlledActivityBuckets,
  controlledActivityStats,
  controlledCacheInfo,
  disableAutoFetch = false
}: ChatHistoryTimelineProps) {
  const [events, setEvents] = useState<ChatEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [cacheInfo, setCacheInfo] = useState<{ updatedAt: string; summary?: string; activityLevel?: string } | null>(null)
  const [mode, setMode] = useState<TimelineMode>(defaultMode)
  const [isHovered, setIsHovered] = useState(false)
  
  // Activity data
  const [activityBuckets, setActivityBuckets] = useState<ActivityBucket[]>([])
  const [activityStats, setActivityStats] = useState<ActivityStats | null>(null)
  const [isLoadingActivity, setIsLoadingActivity] = useState(false)
  
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)
  const isControlled = controlledEvents !== undefined
  const displayEvents = useMemo(
    () => isControlled
      ? controlledEvents.map(event => ({
          ...event,
          type: normalizeChatEventType(event.type)
        }))
      : events,
    [controlledEvents, events, isControlled]
  )
  const displayActivityBuckets = isControlled ? controlledActivityBuckets ?? [] : activityBuckets
  const displayActivityStats = isControlled ? controlledActivityStats ?? null : activityStats
  const displayCacheInfo = isControlled ? controlledCacheInfo ?? null : cacheInfo
  const displayHasLoaded = isControlled ? true : hasLoaded
  const displayError = isControlled ? null : error

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
  }, [checkScroll, displayEvents])
  
  // Auto-scroll to the right (newest events) after loading
  useEffect(() => {
    if (displayHasLoaded && displayEvents.length > 0 && scrollRef.current && compact) {
      // Small delay to ensure rendering is complete
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
        }
      }, 100)
    }
  }, [displayHasLoaded, displayEvents.length, compact])
  
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
      
      // STEP 1: Load activity data FIRST (for bar chart context)
      console.log(`[ChatTimeline] 📊 Fetching activity data first...`)
      let fetchedBuckets: ActivityBucket[] = []
      let fetchedStats: ActivityStats | null = null
      
      try {
        const activityRes = await fetch(`/test-timeline/api/activity?mode=${mode}&_t=${Date.now()}`)
        if (activityRes.ok) {
          const activityData = await activityRes.json()
          fetchedBuckets = activityData.buckets || []
          fetchedStats = activityData.stats || null
          console.log(`[ChatTimeline] ✅ Got ${fetchedBuckets.length} activity buckets, peak: ${fetchedStats?.peakTime}`)
          
          // Update state for immediate display
          setActivityBuckets(fetchedBuckets)
          setActivityStats(fetchedStats)
        }
      } catch (actErr) {
        console.warn('[ChatTimeline] Activity fetch failed, continuing without:', actErr)
      }
      
      // STEP 2: Call AI endpoint with activity context (STREAMING)
      console.log(`[ChatTimeline] 🤖 Calling AI with streaming...`)
      const res = await fetch('/test-timeline/api/analyze', { 
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          mode,
          activityBuckets: fetchedBuckets,
          activityStats: fetchedStats
        }),
        cache: 'no-store'
      })
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'AI analysis failed')
      }
      
      // Helper to validate event type
      const validTypes: ChatEventType[] = ['discussion', 'prediction', 'drama', 'insight', 'milestone', 'humor']
      const parseType = (t: string | undefined): ChatEventType => {
        if (!t) return 'discussion'
        const lower = t.toLowerCase().trim()
        if (validTypes.includes(lower as ChatEventType)) return lower as ChatEventType
        if (lower.includes('discuss') || lower.includes('chat')) return 'discussion'
        if (lower.includes('predict') || lower.includes('prognose') || lower.includes('call')) return 'prediction'
        if (lower.includes('drama') || lower.includes('streit') || lower.includes('beef')) return 'drama'
        if (lower.includes('insight') || lower.includes('erkenntnis')) return 'insight'
        if (lower.includes('mile') || lower.includes('meilenstein')) return 'milestone'
        if (lower.includes('humor') || lower.includes('witz') || lower.includes('lol')) return 'humor'
        return 'discussion'
      }
      
      // Helper to map AI events to our format
      const mapEvents = (aiEvents: AITimelineEvent[]): ChatEvent[] => {
        return aiEvents
          .filter(evt => evt.title && evt.date && evt.time) // Only complete events
          .map((evt, idx) => ({
            id: `ai-${mode}-${idx}`,
            date: evt.date || new Date().toISOString().split('T')[0],
            time: evt.time || '12:00',
            label: evt.label,
            title: evt.title || 'Event',
            description: evt.quote 
              ? `*"${evt.quote}"* — @${evt.quoteAuthor || 'User'}\n\n${evt.description || ''}`
              : evt.description || '',
            type: parseType(evt.type),
            participants: evt.participants || [],
            quote: evt.quote,
            quoteAuthor: evt.quoteAuthor,
          }))
      }
      
      // Read streaming response
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')
      
      const decoder = new TextDecoder()
      let fullText = ''
      let lastEventCount = 0
      
      setHasLoaded(true) // Show timeline immediately
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        fullText += decoder.decode(value, { stream: true })
        
        // Try to parse partial JSON to extract events
        try {
          // The stream sends partial JSON, try to parse what we have
          // Look for complete events in the events array
          const eventsMatch = fullText.match(/"events"\s*:\s*\[([\s\S]*)/)?.[1]
          if (eventsMatch) {
            // Find complete event objects
            let bracketCount = 0
            let lastCompleteIdx = -1
            let inString = false
            let escape = false
            
            for (let i = 0; i < eventsMatch.length; i++) {
              const char = eventsMatch[i]
              
              if (escape) {
                escape = false
                continue
              }
              if (char === '\\') {
                escape = true
                continue
              }
              if (char === '"' && !escape) {
                inString = !inString
                continue
              }
              if (inString) continue
              
              if (char === '{') bracketCount++
              if (char === '}') {
                bracketCount--
                if (bracketCount === 0) {
                  lastCompleteIdx = i
                }
              }
            }
            
            if (lastCompleteIdx > 0) {
              const completeEventsStr = '[' + eventsMatch.slice(0, lastCompleteIdx + 1) + ']'
              try {
                const partialEvents = JSON.parse(completeEventsStr)
                if (Array.isArray(partialEvents) && partialEvents.length > lastEventCount) {
                  const mapped = mapEvents(partialEvents)
                  if (mapped.length > lastEventCount) {
                    console.log(`[ChatTimeline] 🔄 Streaming: ${mapped.length} events`)
                    setEvents(mapped)
                    lastEventCount = mapped.length
                  }
                }
              } catch {
                // Partial JSON not yet valid, continue
              }
            }
          }
        } catch {
          // Continue accumulating
        }
      }
      
      // Final parse of complete response
      try {
        const finalData = JSON.parse(fullText)
        const finalEvents = mapEvents(finalData.events || [])
        setEvents(finalEvents)
        setCacheInfo({ 
          updatedAt: new Date().toISOString(),
          summary: finalData.summary,
          activityLevel: finalData.activityLevel
        })
        console.log(`[ChatTimeline] ✅ Stream complete: ${finalEvents.length} events (${finalData.activityLevel || 'unknown'})`)
      } catch (parseErr) {
        console.warn('[ChatTimeline] Final parse error:', parseErr)
      }
      
    } catch (err) {
      console.error('[ChatTimeline] Refresh error:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Aktualisieren')
      setHasLoaded(true)
    } finally {
      setIsRefreshing(false)
    }
  }, [isRefreshing, mode])

  // Load timeline from cache (with automatic refresh if expired/stale)
  const loadTimeline = useCallback(async (options: { allowGenerate?: boolean; showLoading?: boolean } = {}) => {
    const { allowGenerate = true, showLoading = true } = options
    if (isLoading || isRefreshing) return // Prevent duplicate calls
    
    if (showLoading) setIsLoading(true)
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
            if (showLoading) setIsLoading(false)
            if (allowGenerate) setTimeout(() => refreshTimeline(), 100)
            return
          } else if (cacheData.stale) {
            // Cache stale (>30min) - refresh in background
            console.log('[ChatTimeline] 📊 Cache stale, background refresh...')
            if (showLoading) setIsLoading(false)
            if (allowGenerate) setTimeout(() => refreshTimeline(), 500)
            return
          } else if (mode === '24h' && !isCacheFromToday) {
            // 24h mode but cache is not from today - refresh
            console.log('[ChatTimeline] 📅 24h cache not from today, auto-refreshing...')
            if (showLoading) setIsLoading(false)
            if (allowGenerate) setTimeout(() => refreshTimeline(), 100)
            return
          }
        } else {
          // No cache or empty, generate new
          console.log('[ChatTimeline] No cache found, generating...')
          if (showLoading) setIsLoading(false)
          if (allowGenerate) await refreshTimeline()
          return
        }
      } else if (cacheRes.status === 404) {
        // No cache, generate new
        console.log('[ChatTimeline] No cache found (404), generating...')
        if (showLoading) setIsLoading(false)
        if (allowGenerate) await refreshTimeline()
        return
      } else {
        throw new Error('Failed to load cache')
      }
      
    } catch (err) {
      console.error('[ChatTimeline] Error:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Laden')
      setHasLoaded(true)
    } finally {
      if (showLoading) setIsLoading(false)
    }
  }, [isLoading, isRefreshing, mode, refreshTimeline])

  // Auto-start if enabled (only once)
  const hasStartedRef = useRef(false)
  useEffect(() => {
    if (disableAutoFetch) return
    if (autoStart && !hasStartedRef.current && !displayHasLoaded) {
      hasStartedRef.current = true
      loadTimeline()
      loadActivity()
    }
  }, [autoStart, displayHasLoaded, loadTimeline, loadActivity, disableAutoFetch])

  useEffect(() => {
    if (disableAutoFetch) return
    if (cacheRefreshKey <= 0) return
    console.log('[ChatTimeline] 🔁 Cache refresh signal received')
    loadTimeline({ allowGenerate: false, showLoading: false })
    loadActivity()
  }, [cacheRefreshKey, loadTimeline, loadActivity, disableAutoFetch])
  
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
    if (hasStartedRef.current && !displayHasLoaded && !isLoading && !isRefreshing) {
      loadTimeline()
      loadActivity()
    }
  }, [mode, displayHasLoaded, isLoading, isRefreshing, loadTimeline, loadActivity])

  // Group events by date for display
  const eventsByDate = displayEvents.reduce((acc, event) => {
    if (!acc[event.date]) acc[event.date] = []
    acc[event.date].push(event)
    return acc
  }, {} as Record<string, ChatEvent[]>)
  
  // Sort dates newest first (today on the left)
  const sortedDates = Object.keys(eventsByDate).sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  )
  
  // Match events to activity buckets for positioning
  const eventsWithBuckets = displayEvents.map(event => {
    const eventDateTime = new Date(`${event.date}T${event.time}:00`)
    let closestBucket = displayActivityBuckets[0]
    let minDiff = Infinity
    
    for (const bucket of displayActivityBuckets) {
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

  // ========== MINI MODE (same as compact, but smaller heights - expands on hover) ==========
  if (mini) {
    // Mini mode sizing - ultra compact when not hovered, expands on hover
    const miniCardHeight = isHovered ? 44 : 14  // Ultra compact when collapsed - just title
    const miniCardWidth = isHovered ? 140 : 85
    const miniBarMaxHeight = isHovered ? 50 : 14
    const miniCardGap = isHovered ? 10 : 4  // Gap between stacked cards (includes connector space)
    
    return (
      <div 
        className={`relative ${className}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex flex-col">
          {/* Top row: Controls - smaller in mini mode */}
          <div className={`flex items-center gap-2 px-3 border-b border-foreground/5 transition-all duration-200 ${
            isHovered ? 'py-1.5' : 'py-0.5'
          }`}>
            {/* Mode selector */}
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
            <div className="flex items-center">
              {displayCacheInfo && !isLoading && !isRefreshing && (
                <span className="text-[8px] text-foreground/60 dark:text-foreground/70 whitespace-nowrap leading-none">
                  {formatDetailedTimeAgo(displayCacheInfo.updatedAt)}
                </span>
              )}
              {(isLoading || isRefreshing) && (
                <span className="text-[8px] text-foreground/50 dark:text-foreground/60 whitespace-nowrap leading-none">
                  {isRefreshing ? 'AI...' : '...'}
                </span>
              )}
            </div>
          </div>
          
          {/* Timeline content */}
          <div className="w-full relative">
            {/* Loading */}
            {isLoading && !displayHasLoaded && (
              <div className="flex items-center justify-center py-1">
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Timeline with integrated activity bars */}
            {displayHasLoaded && displayEvents.length > 0 && displayActivityBuckets.length > 0 && !isLoading && (
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
                    className="absolute left-1 top-1/2 -translate-y-1/2 z-30 p-0.5 rounded-full bg-background/80 border border-foreground/10 hover:bg-muted transition-all"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                )}
                {canScrollRight && (
                  <button
                    onClick={() => scroll('right')}
                    className="absolute right-1 top-1/2 -translate-y-1/2 z-30 p-0.5 rounded-full bg-background/80 border border-foreground/10 hover:bg-muted transition-all"
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
                  {(() => {
                    // Mini mode: use smaller sizes, expand on hover
                    const cardHeight = miniCardHeight
                    const cardWidth = miniCardWidth
                    const cardGap = miniCardGap
                    const bucketWidth = isHovered ? 24 : 20
                    const fontSize = isHovered ? '[7px]' : '[5px]'
                    const titleSize = isHovered ? '[8px]' : '[6px]'
                    
                    // Horizontal spacing between cards (prevents overlap)
                    const horizontalCardGap = isHovered ? 12 : 6
                    
                    const leftPadding = Math.ceil(cardWidth / 2) + 10
                    
                    const rowOccupancy: Array<Array<{ start: number; end: number }>> = []
                    const maxRows = 15
                    
                    for (let i = 0; i < maxRows; i++) {
                      rowOccupancy.push([])
                    }
                    
                    type EventPosition = {
                      event: typeof eventsWithBuckets[0]
                      bucketIdx: number
                      row: number
                      xCenter: number
                    }
                    const eventPositions: EventPosition[] = []
                    
                    eventsWithBuckets.forEach((event) => {
                      const bucketIdx = displayActivityBuckets.findIndex(b => b.timestamp === event.bucket?.timestamp)
                      if (bucketIdx === -1) return
                      
                      const xCenter = bucketIdx * bucketWidth
                      // Add horizontal gap to collision detection
                      const cardLeft = xCenter - cardWidth / 2 - horizontalCardGap / 2
                      const cardRight = xCenter + cardWidth / 2 + horizontalCardGap / 2
                      
                      let assignedRow = 0
                      for (let row = 0; row < maxRows; row++) {
                        const overlaps = rowOccupancy[row].some(occupied => 
                          !(cardRight < occupied.start || cardLeft > occupied.end)
                        )
                        if (!overlaps) {
                          assignedRow = row
                          break
                        }
                      }
                      
                      rowOccupancy[assignedRow].push({ start: cardLeft, end: cardRight })
                      
                      eventPositions.push({
                        event,
                        bucketIdx,
                        row: assignedRow,
                        xCenter
                      })
                    })
                    
                    const rowsUsed = Math.max(1, ...eventPositions.map(p => p.row + 1))
                    // Container height adjusts based on hover state - ultra compact when collapsed
                    const baseHeight = isHovered ? 60 : 22
                    const containerHeight = baseHeight + (rowsUsed * (cardHeight + cardGap))
                    
                    const eventsByBucket = new Map<number, EventPosition[]>()
                    eventPositions.forEach(pos => {
                      const existing = eventsByBucket.get(pos.bucketIdx) || []
                      existing.push(pos)
                      eventsByBucket.set(pos.bucketIdx, existing)
                    })
                    
                    // Calculate day boundaries for markers
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    
                    const getDayLabel = (date: Date): string | null => {
                      const d = new Date(date)
                      d.setHours(0, 0, 0, 0)
                      const diffDays = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
                      
                      if (diffDays === 0) return 'HEUTE'
                      if (diffDays === 1) return 'GESTERN'
                      if (diffDays === 2) return 'VORGESTERN'
                      return null
                    }
                    
                    // Find bucket indices where day changes
                    const dayBoundaries: { idx: number; label: string; isToday: boolean }[] = []
                    let lastDateStr = ''
                    displayActivityBuckets.forEach((bucket, idx) => {
                      const bucketDate = new Date(bucket.timestamp)
                      const dateStr = bucketDate.toDateString()
                      if (dateStr !== lastDateStr) {
                        const label = getDayLabel(bucketDate)
                        const dayNames = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA']
                        const dayAbbr = dayNames[bucketDate.getDay()]
                        const displayLabel = label || `${dayAbbr} ${bucketDate.getDate()}.${bucketDate.getMonth() + 1}`
                        
                        bucketDate.setHours(0, 0, 0, 0)
                        const isToday = bucketDate.getTime() === today.getTime()
                        
                        dayBoundaries.push({ idx, label: displayLabel, isToday })
                        lastDateStr = dateStr
                      }
                    })
                    
                    return (
                      <div 
                        className={`relative min-w-max transition-all duration-300 ${isHovered ? 'py-2' : 'py-0.5'}`}
                        style={{ height: `${containerHeight}px`, paddingLeft: `${leftPadding}px`, paddingRight: `${leftPadding}px` }}
                      >
                        {/* Day boundary markers - vertical lines with labels */}
                        {dayBoundaries.map(({ idx, label, isToday }) => (
                          <div 
                            key={`day-${idx}`}
                            className="absolute top-0 bottom-0 flex flex-col items-center pointer-events-none z-30"
                            style={{ left: `${leftPadding + idx * bucketWidth - 1}px` }}
                          >
                            {/* Vertical line */}
                            <div className={`w-px h-full ${isToday ? 'bg-primary/60' : 'bg-foreground/20'}`} />
                            
                            {/* Day label at top */}
                            <div 
                              className={`absolute top-0 left-1/2 -translate-x-1/2 rounded-b font-bold whitespace-nowrap transition-all duration-300 ${
                                isToday 
                                  ? 'bg-primary text-primary-foreground' 
                                  : 'bg-muted/80 text-foreground/70'
                              } ${isHovered ? 'px-1.5 py-0.5' : 'px-1 py-0'}`}
                              style={{ fontSize: isHovered ? '9px' : '6px' }}
                            >
                              {isToday && <span className="mr-0.5">▼</span>}
                              {label}
                            </div>
                          </div>
                        ))}
                        
                        <div 
                          className="absolute left-0 right-0 flex items-end gap-[2px] transition-all duration-300" 
                          style={{ 
                            bottom: isHovered ? '24px' : '4px',
                            paddingLeft: `${leftPadding}px`, 
                            paddingRight: `${leftPadding}px` 
                          }}
                        >
                          {displayActivityBuckets.map((bucket, idx) => {
                            const maxCount = displayActivityStats?.maxPerBucket || Math.max(...displayActivityBuckets.map(b => b.count), 1)
                            const heightPercent = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0
                            const barHeight = bucket.count > 0 
                              ? Math.max(2, (heightPercent / 100) * miniBarMaxHeight)
                              : 2
                            
                            const bucketEventPositions = eventsByBucket.get(idx) || []
                            
                            return (
                              <div key={idx} className="relative flex flex-col items-center group" style={{ minWidth: isHovered ? '22px' : '18px' }}>
                                {/* Mini event cards */}
                                {bucketEventPositions.map((pos, eventIdx) => {
                                  const event = pos.event
                                  const eventStyle = getEventStyle(event.type)
                                  const verticalOffset = pos.row * (cardHeight + cardGap)
                                  const displayLabel = event.label || eventStyle.label
                                  
                                  return (
                                    <MiniEventCard
                                      key={`mini-${idx}-${event.id}-${eventIdx}`}
                                      event={event}
                                      style={eventStyle}
                                      displayLabel={displayLabel}
                                      cardWidth={cardWidth}
                                      cardHeight={cardHeight}
                                      barHeight={barHeight}
                                      verticalOffset={verticalOffset}
                                      fontSize={fontSize}
                                      titleSize={titleSize}
                                      isHovered={isHovered}
                                    />
                                  )
                                })}
                                
                                {/* Activity bar */}
                                <div 
                                  className="rounded-t transition-all duration-300 group-hover:brightness-125"
                                  style={{ 
                                    width: isHovered ? '20px' : '14px',
                                    height: `${barHeight}px`,
                                    backgroundColor: getBarColor(bucket.intensity)
                                  }}
                                />
                                
                                {/* Tooltip on hover */}
                                {isHovered && (
                                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 
                                    transition-opacity duration-100 pointer-events-none z-50 whitespace-nowrap">
                                    <div className="bg-popover/95 backdrop-blur border border-border rounded px-1 py-0.5 text-[7px]">
                                      <span className="font-mono">{bucket.label}</span>
                                      <span className="text-muted-foreground ml-1">{bucket.count}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}
                </div>
                
                {/* Time scale - only show when hovered */}
                <div className={`flex items-start gap-[2px] border-t border-foreground/5 overflow-x-auto transition-all duration-300 ${
                  isHovered ? 'py-1 opacity-100 max-h-8' : 'py-0 opacity-0 max-h-0'
                }`} style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', paddingLeft: '70px', paddingRight: '70px' }}>
                  {displayActivityBuckets.map((bucket, idx) => {
                    const bucketDate = new Date(bucket.timestamp)
                    const prevBucket = idx > 0 ? displayActivityBuckets[idx - 1] : null
                    const prevDate = prevBucket ? new Date(prevBucket.timestamp) : null
                    
                    const isNewDay = !prevDate || bucketDate.toDateString() !== prevDate.toDateString()
                    
                    const dayNames = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA']
                    const dayAbbr = dayNames[bucketDate.getDay()]
                    const dayAndMonth = `${dayAbbr} ${bucketDate.getDate()}.${bucketDate.getMonth() + 1}`
                    
                    return (
                      <div key={idx} className="relative flex flex-col items-center" style={{ minWidth: '22px' }}>
                        {isNewDay && (
                          <div className="text-[8px] font-bold text-foreground whitespace-nowrap">
                            {dayAndMonth}
                          </div>
                        )}
                        
                        {idx % 6 === 0 && !isNewDay && (
                          <div className="text-[6px] text-muted-foreground/70 font-mono whitespace-nowrap">
                            {bucket.label.split(' ').pop()}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Empty state */}
            {displayHasLoaded && displayEvents.length === 0 && !isLoading && !displayError && (
              <div className="flex items-center justify-center py-1 text-[8px] text-foreground/50">
                Keine Events
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ========== COMPACT MODE ==========
  if (compact) {
    return (
      <div className={`relative flex flex-col ${className}`}>
        {/* Top row: Controls on top left */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-foreground/5">
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
          <div className="flex items-center">
            {displayCacheInfo && !isLoading && !isRefreshing && (
              <span className="text-[8px] text-foreground/60 dark:text-foreground/70 whitespace-nowrap leading-none">
                {formatDetailedTimeAgo(displayCacheInfo.updatedAt)}
              </span>
            )}
            {(isLoading || isRefreshing) && (
              <span className="text-[8px] text-foreground/50 dark:text-foreground/60 whitespace-nowrap leading-none">
                {isRefreshing ? 'AI...' : '...'}
              </span>
            )}
          </div>
        </div>

        {/* Timeline content - full width */}
        <div className="w-full relative">
            {/* Compact: Loading */}
            {isLoading && !displayHasLoaded && (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Compact: Timeline with integrated activity bars */}
            {displayHasLoaded && displayEvents.length > 0 && displayActivityBuckets.length > 0 && !isLoading && (
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
                  {(() => {
                    // Calculate dynamic sizing based on event count and mode
                    const eventCount = displayEvents.length
                    // Scale card size based on event count
                    const isCompact = eventCount > 10
                    const isTiny = eventCount > 14
                    
                    // Card dimensions - wider for full titles
                    const cardHeight = isTiny ? 44 : isCompact ? 52 : 60
                    const cardWidth = isTiny ? 130 : isCompact ? 160 : 180
                    const cardGap = 12
                    const bucketWidth = 24 // 22px min + 2px gap
                    const fontSize = isTiny ? '[7px]' : isCompact ? '[8px]' : '[9px]'
                    const titleSize = isTiny ? '[8px]' : isCompact ? '[9px]' : '[10px]'
                    
                    // Horizontal spacing between cards
                    const horizontalCardGap = 12
                    
                    // Left padding to prevent cards from being cut off
                    const leftPadding = Math.ceil(cardWidth / 2) + 20
                    
                    // PRE-CALCULATE card positions with collision detection
                    // Track occupied ranges per row: { row: [{ start, end }, ...] }
                    const rowOccupancy: Array<Array<{ start: number; end: number }>> = []
                    const maxRows = 15 // Allow up to 15 rows
                    
                    // Initialize rows
                    for (let i = 0; i < maxRows; i++) {
                      rowOccupancy.push([])
                    }
                    
                    // Build event position map
                    type EventPosition = {
                      event: typeof eventsWithBuckets[0]
                      bucketIdx: number
                      row: number
                      xCenter: number
                    }
                    const eventPositions: EventPosition[] = []
                    
                    // First pass: assign each event to a bucket index and find non-overlapping row
                    eventsWithBuckets.forEach((event) => {
                      // Find bucket index
                      const bucketIdx = displayActivityBuckets.findIndex(b => b.timestamp === event.bucket?.timestamp)
                      if (bucketIdx === -1) return
                      
                      // Calculate horizontal center position
                      const xCenter = bucketIdx * bucketWidth
                      // Add horizontal gap to collision detection
                      const cardLeft = xCenter - cardWidth / 2 - horizontalCardGap / 2
                      const cardRight = xCenter + cardWidth / 2 + horizontalCardGap / 2
                      
                      // Find first row where this card doesn't overlap
                      let assignedRow = 0
                      for (let row = 0; row < maxRows; row++) {
                        const overlaps = rowOccupancy[row].some(occupied => 
                          !(cardRight < occupied.start || cardLeft > occupied.end)
                        )
                        if (!overlaps) {
                          assignedRow = row
                          break
                        }
                      }
                      
                      // Mark this space as occupied
                      rowOccupancy[assignedRow].push({ start: cardLeft, end: cardRight })
                      
                      eventPositions.push({
                        event,
                        bucketIdx,
                        row: assignedRow,
                        xCenter
                      })
                    })
                    
                    // Calculate actual rows used
                    const rowsUsed = Math.max(1, ...eventPositions.map(p => p.row + 1))
                    
                    // Container height based on rows needed
                    const containerHeight = 80 + (rowsUsed * (cardHeight + cardGap))
                    
                    // Create lookup for event positions by bucket
                    const eventsByBucket = new Map<number, EventPosition[]>()
                    eventPositions.forEach(pos => {
                      const existing = eventsByBucket.get(pos.bucketIdx) || []
                      existing.push(pos)
                      eventsByBucket.set(pos.bucketIdx, existing)
                    })
                    
                    // Calculate day boundaries for markers
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    
                    const getDayLabel = (date: Date): string | null => {
                      const d = new Date(date)
                      d.setHours(0, 0, 0, 0)
                      const diffDays = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
                      
                      if (diffDays === 0) return 'HEUTE'
                      if (diffDays === 1) return 'GESTERN'
                      if (diffDays === 2) return 'VORGESTERN'
                      return null
                    }
                    
                    // Find bucket indices where day changes
                    const dayBoundaries: { idx: number; label: string; isToday: boolean }[] = []
                    let lastDateStr = ''
                    displayActivityBuckets.forEach((bucket, idx) => {
                      const bucketDate = new Date(bucket.timestamp)
                      const dateStr = bucketDate.toDateString()
                      if (dateStr !== lastDateStr) {
                        const label = getDayLabel(bucketDate)
                        const dayNames = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA']
                        const dayAbbr = dayNames[bucketDate.getDay()]
                        const displayLabel = label || `${dayAbbr} ${bucketDate.getDate()}.${bucketDate.getMonth() + 1}`
                        
                        bucketDate.setHours(0, 0, 0, 0)
                        const isToday = bucketDate.getTime() === today.getTime()
                        
                        dayBoundaries.push({ idx, label: displayLabel, isToday })
                        lastDateStr = dateStr
                      }
                    })
                    
                    return (
                      <div className="relative min-w-max py-3" style={{ height: `${containerHeight}px`, paddingLeft: `${leftPadding}px`, paddingRight: `${leftPadding}px` }}>
                        {/* Day boundary markers - vertical lines with labels */}
                        {dayBoundaries.map(({ idx, label, isToday }) => (
                          <div 
                            key={`day-${idx}`}
                            className="absolute top-0 bottom-0 flex flex-col items-center pointer-events-none z-30"
                            style={{ left: `${leftPadding + idx * bucketWidth - 1}px` }}
                          >
                            {/* Vertical line */}
                            <div className={`w-px h-full ${isToday ? 'bg-primary/60' : 'bg-foreground/20'}`} />
                            
                            {/* Day label at top */}
                            <div 
                              className={`absolute top-0 left-1/2 -translate-x-1/2 px-2 py-1 rounded-b text-[9px] font-bold whitespace-nowrap ${
                                isToday 
                                  ? 'bg-primary text-primary-foreground' 
                                  : 'bg-muted/80 text-foreground/70'
                              }`}
                            >
                              {isToday && <span className="mr-1">▼</span>}
                              {label}
                            </div>
                          </div>
                        ))}
                        
                        {/* Activity bars and timeline scale */}
                        <div className="absolute bottom-8 left-0 right-0 flex items-end gap-[2px]" style={{ paddingLeft: `${leftPadding}px`, paddingRight: `${leftPadding}px` }}>
                          {displayActivityBuckets.map((bucket, idx) => {
                            const maxCount = displayActivityStats?.maxPerBucket || Math.max(...displayActivityBuckets.map(b => b.count), 1)
                            const heightPercent = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0
                            const barHeight = bucket.count > 0 
                              ? Math.max(4, (heightPercent / 100) * 50)
                              : 4
                            
                            // Get pre-calculated event positions for this bucket
                            const bucketEventPositions = eventsByBucket.get(idx) || []
                            
                            return (
                              <div key={idx} className="relative flex flex-col items-center group" style={{ minWidth: '22px' }}>
                                {/* Event cards above the bar - using pre-calculated positions */}
                                {bucketEventPositions.map((pos, eventIdx) => {
                                  const event = pos.event
                                  const style = getEventStyle(event.type)
                                  const verticalOffset = pos.row * (cardHeight + cardGap)
                                  const displayLabel = event.label || style.label
                                  
                                  return (
                                    <InlineEventCard
                                      key={`${idx}-${event.id}-${eventIdx}`}
                                      event={event}
                                      style={style}
                                      displayLabel={displayLabel}
                                      cardWidth={cardWidth}
                                      barHeight={barHeight}
                                      verticalOffset={verticalOffset}
                                      fontSize={fontSize}
                                      titleSize={titleSize}
                                      isTiny={isTiny}
                                    />
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
                          })}
                        </div>
                      </div>
                    )
                  })()}
                </div>
                
                {/* Time scale - BELOW the scrollable area */}
                <div className="flex items-start gap-[2px] py-1 border-t border-foreground/5 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', paddingLeft: '95px', paddingRight: '95px' }}>
                  {displayActivityBuckets.map((bucket, idx) => {
                    const bucketDate = new Date(bucket.timestamp)
                    const prevBucket = idx > 0 ? displayActivityBuckets[idx - 1] : null
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
            )}

          {/* Compact: Empty state - just show nothing or minimal text */}
          {displayHasLoaded && displayEvents.length === 0 && !isLoading && !displayError && (
            <div className="flex items-center justify-center py-3 text-[10px] text-foreground/50 dark:text-foreground/60">
              Keine Chat-Events
            </div>
          )}
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
          {displayCacheInfo && !isLoading && !isRefreshing && (
            <span className="text-[10px] text-foreground/60 dark:text-foreground/70">
              {formatTimeAgo(displayCacheInfo.updatedAt)}
              {displayCacheInfo.activityLevel && (
                <span className={`ml-2 ${
                  displayCacheInfo.activityLevel === 'high' ? 'text-emerald-500' :
                  displayCacheInfo.activityLevel === 'medium' ? 'text-amber-500' : 'text-muted-foreground'
                }`}>
                  • {displayCacheInfo.activityLevel === 'high' ? '🔥' : displayCacheInfo.activityLevel === 'medium' ? '📊' : '😴'}
                </span>
              )}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Refresh button */}
          {showRefreshButton && displayHasLoaded && (
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
          {displayHasLoaded && displayEvents.length > 0 && (
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
          
          {!displayHasLoaded && !isLoading && (
            <button
              onClick={() => loadTimeline()}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
            >
              📜 Timeline laden
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      {displayHasLoaded && displayEvents.length > 0 && (
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
      {displayError && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
          <p className="text-sm text-muted-foreground">{displayError}</p>
          <button
            onClick={() => loadTimeline()}
            className="mt-3 text-sm text-primary hover:underline"
          >
            Erneut versuchen
          </button>
        </div>
      )}

      {/* Empty state - not loaded yet */}
      {!displayHasLoaded && !isLoading && !displayError && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MessageSquare className="w-12 h-12 text-foreground/30 dark:text-foreground/40 mb-4" />
          <p className="text-foreground/70 dark:text-foreground/80 mb-2">Chat-Chronik</p>
          <p className="text-sm text-foreground/60 dark:text-foreground/70 max-w-sm">
            Zeigt wichtige Momente und Diskussionen aus dem TradingView-Chat der letzten Tage.
          </p>
        </div>
      )}

      {/* Timeline content */}
      {displayHasLoaded && displayEvents.length > 0 && !isLoading && (
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
      {displayHasLoaded && displayEvents.length === 0 && !isLoading && !displayError && (
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
