/**
 * NewspaperTimeline.tsx
 * 
 * Infinite scroll timeline showing multiple newspaper editions.
 * 
 * LOCAL: Displays a vertical timeline of cached newspaper days.
 * Each day has a prominent date header and separator.
 * Uses intersection observer for infinite scroll loading.
 * 
 * GLOBAL: Provides a scrollable archive view of past newspaper editions.
 * Shows today first, then progressively loads older days from cache.
 * 
 * EXPORTS: NewspaperTimeline (React component)
 */

'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ChevronDown, Calendar, Users, MessageSquare, Loader2 } from 'lucide-react'
import type { UnifiedNewspaperData } from '../lib/types'
import { getCategoryStyle, getEventStyle } from './ui/helpers'
import { ContributorAvatar } from './ContributorAvatar'

interface CachedNewspaper {
  date: string
  data: UnifiedNewspaperData
  messageCount: number
  uniqueUsers: number
  updatedAt: string
}

interface CacheListResponse {
  dates: {
    date: string
    messageCount: number
    uniqueUsers: number
    updatedAt: string
    dayRange: number
  }[]
  total: number
  hasMore: boolean
}

interface CacheResponse {
  data: UnifiedNewspaperData
  messageCount: number
  uniqueUsers: number
  updatedAt: string
  dayRange: number
}

/**
 * Format date for display in German
 */
function formatDateHeader(dateStr: string): { weekday: string; date: string; relative: string } {
  const date = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  
  const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  
  let relative = ''
  if (diffDays === 0) relative = 'Heute'
  else if (diffDays === 1) relative = 'Gestern'
  else if (diffDays === 2) relative = 'Vorgestern'
  else if (diffDays < 7) relative = `Vor ${diffDays} Tagen`
  else relative = `Vor ${Math.floor(diffDays / 7)} Woche${diffDays >= 14 ? 'n' : ''}`
  
  return {
    weekday: date.toLocaleDateString('de-DE', { weekday: 'long' }),
    date: date.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }),
    relative
  }
}

/**
 * Generate a URL-safe slug from a headline
 */
function generateSlug(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => {
      const map: Record<string, string> = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }
      return map[char] || char
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

/**
 * Day Header Component - Visual separator between days
 */
function DayHeader({ 
  date, 
  messageCount, 
  uniqueUsers,
  isFirst 
}: { 
  date: string
  messageCount: number
  uniqueUsers: number
  isFirst?: boolean
}) {
  const { weekday, date: dateStr, relative } = formatDateHeader(date)
  const isToday = relative === 'Heute'
  
  return (
    <div className={`relative ${isFirst ? '' : 'mt-16'}`}>
      {/* Connecting line from previous content */}
      {!isFirst && (
        <div className="absolute left-1/2 -top-16 w-px h-16 bg-gradient-to-b from-transparent via-foreground/20 to-foreground/40" />
      )}
      
      {/* Date badge */}
      <div className="relative flex flex-col items-center mb-8">
        {/* Decorative line */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-foreground/20" />
        
        {/* Date content */}
        <div className={`relative z-10 px-6 py-4 bg-background border-2 ${
          isToday 
            ? 'border-primary/50 shadow-lg shadow-primary/10' 
            : 'border-foreground/20'
        }`}>
          {/* Relative time badge */}
          <div className={`text-center text-xs font-headline uppercase tracking-widest mb-1 ${
            isToday ? 'text-primary' : 'text-muted-foreground'
          }`}>
            {relative}
          </div>
          
          {/* Main date */}
          <div className="flex items-center gap-3">
            <Calendar className={`w-5 h-5 ${isToday ? 'text-primary' : 'text-muted-foreground'}`} />
            <div>
              <div className="font-headline text-lg font-bold">
                {weekday}
              </div>
              <div className="text-sm text-muted-foreground font-body">
                {dateStr}
              </div>
            </div>
          </div>
          
          {/* Stats */}
          <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-foreground/10">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="font-mono">{messageCount.toLocaleString()}</span>
              <span>Nachrichten</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="w-3.5 h-3.5" />
              <span className="font-mono">{uniqueUsers}</span>
              <span>User</span>
            </div>
          </div>
        </div>
        
        {/* Decorative dots */}
        <div className="absolute top-1/2 left-4 w-2 h-2 rounded-full bg-foreground/20 -translate-y-1/2" />
        <div className="absolute top-1/2 right-4 w-2 h-2 rounded-full bg-foreground/20 -translate-y-1/2" />
      </div>
    </div>
  )
}

/**
 * Compact article card for timeline view
 */
function TimelineArticle({ 
  article, 
  type,
  date 
}: { 
  article: UnifiedNewspaperData['featuredArticle'] | UnifiedNewspaperData['secondaryArticle']
  type: 'featured' | 'secondary'
  date: string
}) {
  if (!article?.headline) return null
  
  const slug = generateSlug(article.headline)
  const params = new URLSearchParams({
    type,
    headline: article.headline,
    category: article.category || '',
    date,
    dayRange: '1',
    summary: article.summary || ''
  })
  
  return (
    <article className={`pb-4 mb-4 border-b border-foreground/10 ${
      type === 'featured' ? '' : 'pl-4 border-l-2 border-foreground/10'
    }`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-headline uppercase tracking-wider text-muted-foreground">
          {article.author}
        </span>
        <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
          getCategoryStyle(article.category || '')
        }`}>
          {article.category}
        </span>
      </div>
      
      <h4 className={`font-headline font-bold leading-tight mb-2 hover:text-primary/80 transition-colors ${
        type === 'featured' ? 'text-lg' : 'text-base'
      }`}>
        <Link href={`/newspaper/article/${slug}?${params.toString()}`} prefetch={false}>
          {article.headline}
        </Link>
      </h4>
      
      <p className="text-sm text-muted-foreground font-body line-clamp-2">
        {article.summary}
      </p>
      
      {article.contributors && article.contributors.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {article.contributors.slice(0, 3).map((c, i) => (
            <span key={i} className="px-1.5 py-0.5 bg-muted text-[10px] font-body rounded">
              <ContributorAvatar username={c} size="xs" />
            </span>
          ))}
        </div>
      )}
    </article>
  )
}

/**
 * Compact event card for timeline view
 */
function TimelineEvent({ event }: { event: UnifiedNewspaperData['events'][0] }) {
  if (!event?.title) return null
  
  return (
    <div className="p-3 border border-foreground/10 bg-muted/10 rounded-sm mb-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
          getEventStyle(event.type || '')
        }`}>
          {event.type?.toUpperCase()}
        </span>
      </div>
      <h5 className="font-headline text-sm font-semibold mb-1">{event.title}</h5>
      <p className="text-xs text-muted-foreground font-body line-clamp-2">{event.summary}</p>
    </div>
  )
}

/**
 * Single day's newspaper content in compact timeline format
 */
function DayContent({ newspaper }: { newspaper: CachedNewspaper }) {
  const { data, date } = newspaper
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Main articles column */}
      <div>
        <TimelineArticle article={data.featuredArticle} type="featured" date={date} />
        <TimelineArticle article={data.secondaryArticle} type="secondary" date={date} />
      </div>
      
      {/* Events and more column */}
      <div>
        {/* Events */}
        {data.events && data.events.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-headline uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
              <span className="text-amber-500">⚡</span> Chat-Momente
            </h4>
            {data.events.slice(0, 2).map((event, idx) => (
              <TimelineEvent key={idx} event={event} />
            ))}
          </div>
        )}
        
        {/* More Articles (compact list) */}
        {data.moreArticles && data.moreArticles.length > 0 && (
          <div>
            <h4 className="text-xs font-headline uppercase tracking-wider text-muted-foreground mb-2">
              Weitere Themen
            </h4>
            <div className="space-y-2">
              {data.moreArticles.slice(0, 3).map((article, idx) => (
                <div key={idx} className="text-sm">
                  <span className="text-[10px] text-muted-foreground font-headline uppercase">
                    {article.category}
                  </span>
                  <div className="font-headline font-medium hover:text-primary/80 cursor-pointer transition-colors">
                    {article.headline}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface NewspaperTimelineProps {
  /** Date currently shown in main view - will be skipped in timeline */
  currentDate?: string | null
}

/**
 * Main Timeline Component
 */
export function NewspaperTimeline({ currentDate }: NewspaperTimelineProps) {
  const [newspapers, setNewspapers] = useState<CachedNewspaper[]>([])
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const loadedDatesRef = useRef<Set<string>>(new Set())

  // Fetch list of available cached dates
  const fetchAvailableDates = useCallback(async () => {
    try {
      const response = await fetch('/newspaper/api/cache-list?dayRange=1&limit=30')
      if (!response.ok) throw new Error('Failed to fetch cache list')
      
      const data: CacheListResponse = await response.json()
      // Filter out the currently displayed date to avoid duplication
      const filteredDates = data.dates
        .map(d => d.date)
        .filter(d => d !== currentDate)
      
      setAvailableDates(filteredDates)
      setHasMore(data.hasMore && filteredDates.length < data.total - 1)
      
      return filteredDates
    } catch (err) {
      console.error('[Timeline] Failed to fetch dates:', err)
      setError('Keine gecachten Ausgaben gefunden')
      return []
    }
  }, [currentDate])

  // Fetch a single day's newspaper data
  const fetchNewspaper = useCallback(async (date: string): Promise<CachedNewspaper | null> => {
    if (loadedDatesRef.current.has(date)) return null
    
    try {
      const response = await fetch(`/newspaper/api/cache?date=${date}&dayRange=1`)
      if (!response.ok) return null
      
      const data: CacheResponse = await response.json()
      loadedDatesRef.current.add(date)
      
      return {
        date,
        data: data.data,
        messageCount: data.messageCount,
        uniqueUsers: data.uniqueUsers,
        updatedAt: data.updatedAt
      }
    } catch (err) {
      console.error(`[Timeline] Failed to fetch ${date}:`, err)
      return null
    }
  }, [])

  // Load initial newspapers
  useEffect(() => {
    const loadInitial = async () => {
      setIsLoading(true)
      // Reset state when currentDate changes
      loadedDatesRef.current = new Set()
      setNewspapers([])
      
      const dates = await fetchAvailableDates()
      
      console.log('[Timeline] Available dates (excluding current):', dates)
      
      if (dates.length === 0) {
        setIsLoading(false)
        setHasMore(false)
        return
      }
      
      // Load first 5 days
      const initialDates = dates.slice(0, 5)
      const results = await Promise.all(initialDates.map(fetchNewspaper))
      const validResults = results.filter((r): r is CachedNewspaper => r !== null)
      
      console.log('[Timeline] Loaded newspapers:', validResults.length)
      
      setNewspapers(validResults)
      setHasMore(dates.length > initialDates.length)
      setIsLoading(false)
    }
    
    loadInitial()
  }, [fetchAvailableDates, fetchNewspaper, currentDate])

  // Load more newspapers when scrolling
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return
    
    setIsLoadingMore(true)
    
    // Find next dates to load
    const loadedCount = loadedDatesRef.current.size
    const nextDates = availableDates.slice(loadedCount, loadedCount + 2)
    
    if (nextDates.length === 0) {
      setHasMore(false)
      setIsLoadingMore(false)
      return
    }
    
    const results = await Promise.all(nextDates.map(fetchNewspaper))
    const validResults = results.filter((r): r is CachedNewspaper => r !== null)
    
    if (validResults.length > 0) {
      setNewspapers(prev => [...prev, ...validResults])
    }
    
    if (loadedDatesRef.current.size >= availableDates.length) {
      setHasMore(false)
    }
    
    setIsLoadingMore(false)
  }, [isLoadingMore, hasMore, availableDates, fetchNewspaper])

  // Intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMore()
        }
      },
      { rootMargin: '200px' }
    )
    
    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current)
    }
    
    return () => observer.disconnect()
  }, [hasMore, isLoadingMore, loadMore])

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground font-body">Lade Timeline...</p>
      </div>
    )
  }

  // Error or empty state
  if (error || (newspapers.length === 0 && !isLoading)) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Calendar className="w-10 h-10 text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground font-body">
          {error || 'Keine älteren gecachten Ausgaben'}
        </p>
        <p className="text-xs text-muted-foreground/60 font-body mt-2 max-w-sm">
          Die Timeline zeigt nur Tage, für die bereits eine Zeitung generiert wurde.
          <br />
          Wähle einen anderen Tag oben aus und klicke auf den Refresh-Button, um eine Ausgabe zu erstellen.
        </p>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Newspaper entries */}
      {newspapers.map((newspaper, idx) => (
        <div key={newspaper.date}>
          <DayHeader 
            date={newspaper.date}
            messageCount={newspaper.messageCount}
            uniqueUsers={newspaper.uniqueUsers}
            isFirst={idx === 0}
          />
          <DayContent newspaper={newspaper} />
        </div>
      ))}
      
      {/* Load more trigger */}
      <div ref={loadMoreRef} className="py-8">
        {isLoadingMore && (
          <div className="flex flex-col items-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground font-body">Lade ältere Ausgaben...</p>
          </div>
        )}
        
        {!hasMore && newspapers.length > 0 && (
          <div className="text-center">
            <div className="inline-flex flex-col items-center gap-2 px-4 py-3 border border-foreground/10 rounded text-sm text-muted-foreground font-body">
              <span>📜 Keine weiteren gecachten Ausgaben</span>
              <span className="text-xs text-muted-foreground/60">
                Nur Tage mit vorgenerierten Zeitungen werden hier angezeigt
              </span>
            </div>
          </div>
        )}
        
        {hasMore && !isLoadingMore && (
          <button 
            onClick={loadMore}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors font-body"
          >
            <ChevronDown className="w-4 h-4" />
            Mehr laden
          </button>
        )}
      </div>
    </div>
  )
}

