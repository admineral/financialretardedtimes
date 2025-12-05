/**
 * NewspaperTimeline.tsx
 * 
 * REDESIGNED: Premium dark edition archive timeline
 * 
 * Features:
 * - Gold-accented day headers
 * - Glassmorphism article cards
 * - Infinite scroll with loading animations
 * - Elegant visual separators
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
    <div className={`relative ${isFirst ? '' : 'mt-20'}`}>
      {/* Connecting line */}
      {!isFirst && (
        <div className="absolute left-1/2 -top-20 w-px h-20 bg-gradient-to-b from-transparent via-primary/20 to-primary/40" />
      )}
      
      {/* Date badge */}
      <div className="relative flex flex-col items-center mb-10">
        {/* Decorative line */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        
        {/* Date content */}
        <div className={`
          relative z-10 px-8 py-5 bg-card border-2 rounded-sm
          ${isToday 
            ? 'border-primary/50 shadow-xl shadow-primary/10' 
            : 'border-primary/20'
          }
        `}>
          {/* Relative time badge */}
          <div className={`
            text-center text-xs font-headline uppercase tracking-widest mb-2
            ${isToday ? 'text-primary' : 'text-muted-foreground'}
          `}>
            {relative}
          </div>
          
          {/* Main date */}
          <div className="flex items-center gap-4">
            <Calendar className={`w-6 h-6 ${isToday ? 'text-primary' : 'text-muted-foreground/60'}`} />
            <div>
              <div className="font-headline text-xl font-bold text-foreground">
                {weekday}
              </div>
              <div className="text-sm text-muted-foreground font-body">
                {dateStr}
              </div>
            </div>
          </div>
          
          {/* Stats */}
          <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-primary/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MessageSquare className="w-4 h-4 text-primary/60" />
              <span className="font-mono">{messageCount.toLocaleString()}</span>
              <span className="hidden sm:inline">Nachrichten</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="w-4 h-4 text-primary/60" />
              <span className="font-mono">{uniqueUsers}</span>
              <span className="hidden sm:inline">User</span>
            </div>
          </div>
        </div>
        
        {/* Decorative dots */}
        <div className="absolute top-1/2 left-8 w-2 h-2 rounded-full bg-primary/30 -translate-y-1/2" />
        <div className="absolute top-1/2 right-8 w-2 h-2 rounded-full bg-primary/30 -translate-y-1/2" />
      </div>
    </div>
  )
}

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
    <article className={`
      p-4 rounded-sm transition-all group
      ${type === 'featured' 
        ? 'glass-card-gold' 
        : 'glass-card border-l-2 border-primary/30'
      }
    `}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-headline uppercase tracking-wider text-muted-foreground">
          {article.author}
        </span>
        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-sm border ${
          getCategoryStyle(article.category || '')
        }`}>
          {article.category}
        </span>
      </div>
      
      <h4 className={`
        font-headline font-bold leading-tight mb-3 
        text-foreground group-hover:text-primary transition-colors
        ${type === 'featured' ? 'text-lg' : 'text-base'}
      `}>
        <Link href={`/newspaper/article/${slug}?${params.toString()}`} prefetch={false}>
          {article.headline}
        </Link>
      </h4>
      
      <p className="text-sm text-muted-foreground font-body line-clamp-2 leading-relaxed">
        {article.summary}
      </p>
      
      {article.contributors && article.contributors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-primary/10">
          {article.contributors.slice(0, 3).map((c, i) => (
            <span key={i} className="px-2 py-0.5 bg-card/80 text-[10px] font-body rounded-full border border-primary/10">
              <ContributorAvatar username={c} size="xs" />
            </span>
          ))}
        </div>
      )}
    </article>
  )
}

function TimelineEvent({ event }: { event: UnifiedNewspaperData['events'][0] }) {
  if (!event?.title) return null
  
  return (
    <div className="p-3 glass-card rounded-sm border-l-2 border-amber-500/40">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-sm ${
          getEventStyle(event.type || '')
        }`}>
          {event.type?.toUpperCase()}
        </span>
      </div>
      <h5 className="font-headline text-sm font-semibold text-foreground mb-1">{event.title}</h5>
      <p className="text-xs text-muted-foreground font-body line-clamp-2">{event.summary}</p>
    </div>
  )
}

function DayContent({ newspaper }: { newspaper: CachedNewspaper }) {
  const { data, date } = newspaper
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {/* Main articles column */}
      <div className="space-y-4">
        <TimelineArticle article={data.featuredArticle} type="featured" date={date} />
        <TimelineArticle article={data.secondaryArticle} type="secondary" date={date} />
      </div>
      
      {/* Events and more column */}
      <div className="space-y-4">
        {data.events && data.events.length > 0 && (
          <div>
            <h4 className="text-xs font-headline uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <span className="text-amber-500">⚡</span> Chat-Momente
            </h4>
            <div className="space-y-2">
              {data.events.slice(0, 2).map((event, idx) => (
                <TimelineEvent key={idx} event={event} />
              ))}
            </div>
          </div>
        )}
        
        {data.moreArticles && data.moreArticles.length > 0 && (
          <div>
            <h4 className="text-xs font-headline uppercase tracking-wider text-muted-foreground mb-3">
              Weitere Themen
            </h4>
            <div className="space-y-2">
              {data.moreArticles.slice(0, 3).map((article, idx) => (
                <div key={idx} className="p-3 border border-primary/10 rounded-sm hover:border-primary/30 transition-colors">
                  <span className="text-[9px] text-muted-foreground/60 font-headline uppercase">
                    {article.category}
                  </span>
                  <div className="font-headline text-sm font-medium text-foreground hover:text-primary cursor-pointer transition-colors mt-0.5">
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
  currentDate?: string | null
}

export function NewspaperTimeline({ currentDate }: NewspaperTimelineProps) {
  const [newspapers, setNewspapers] = useState<CachedNewspaper[]>([])
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const loadedDatesRef = useRef<Set<string>>(new Set())

  const fetchAvailableDates = useCallback(async () => {
    try {
      const response = await fetch('/newspaper/api/cache-list?dayRange=1&limit=30')
      if (!response.ok) throw new Error('Failed to fetch cache list')
      
      const data: CacheListResponse = await response.json()
      const filteredDates = data.dates.map(d => d.date).filter(d => d !== currentDate)
      
      setAvailableDates(filteredDates)
      setHasMore(data.hasMore && filteredDates.length < data.total - 1)
      
      return filteredDates
    } catch (err) {
      console.error('[Timeline] Failed to fetch dates:', err)
      setError('Keine gecachten Ausgaben gefunden')
      return []
    }
  }, [currentDate])

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

  useEffect(() => {
    const loadInitial = async () => {
      setIsLoading(true)
      loadedDatesRef.current = new Set()
      setNewspapers([])
      
      const dates = await fetchAvailableDates()
      
      if (dates.length === 0) {
        setIsLoading(false)
        setHasMore(false)
        return
      }
      
      const initialDates = dates.slice(0, 5)
      const results = await Promise.all(initialDates.map(fetchNewspaper))
      const validResults = results.filter((r): r is CachedNewspaper => r !== null)
      
      setNewspapers(validResults)
      setHasMore(dates.length > initialDates.length)
      setIsLoading(false)
    }
    
    loadInitial()
  }, [fetchAvailableDates, fetchNewspaper, currentDate])

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return
    
    setIsLoadingMore(true)
    
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

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="text-sm text-muted-foreground font-body">Lade Timeline...</p>
      </div>
    )
  }

  if (error || (newspapers.length === 0 && !isLoading)) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-card border border-primary/20 flex items-center justify-center mb-4">
          <Calendar className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <p className="text-muted-foreground font-body text-lg mb-2">
          {error || 'Keine älteren Ausgaben'}
        </p>
        <p className="text-xs text-muted-foreground/60 font-body max-w-sm">
          Die Timeline zeigt nur Tage, für die bereits eine Zeitung generiert wurde.
        </p>
      </div>
    )
  }

  return (
    <div className="relative">
      {newspapers.map((newspaper, idx) => (
        <div key={newspaper.date} className="stagger-item" style={{ animationDelay: `${idx * 100}ms` }}>
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
      <div ref={loadMoreRef} className="py-12">
        {isLoadingMore && (
          <div className="flex flex-col items-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary mb-2" />
            <p className="text-sm text-muted-foreground font-body">Lade ältere Ausgaben...</p>
          </div>
        )}
        
        {!hasMore && newspapers.length > 0 && (
          <div className="text-center">
            <div className="inline-flex flex-col items-center gap-2 px-6 py-4 glass-card rounded-sm text-sm text-muted-foreground font-body">
              <span>📜 Ende des Archivs</span>
              <span className="text-xs text-muted-foreground/60">
                Nur Tage mit vorgenerierten Zeitungen werden angezeigt
              </span>
            </div>
          </div>
        )}
        
        {hasMore && !isLoadingMore && (
          <button 
            onClick={loadMore}
            className="w-full flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground hover:text-primary transition-colors font-body group"
          >
            <ChevronDown className="w-4 h-4 group-hover:translate-y-1 transition-transform" />
            Mehr laden
          </button>
        )}
      </div>
    </div>
  )
}
