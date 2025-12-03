/**
 * NewspaperContent.tsx
 * 
 * Main content area displaying AI-generated chat summaries.
 * 
 * LOCAL: Renders featured articles, secondary articles, events, and "more articles" grid.
 * Uses streaming AI responses via useObject hook from @ai-sdk/react.
 * Layout is stable - containers have fixed min-heights to prevent shifts during streaming.
 * Now checks Supabase cache first before triggering AI generation.
 * 
 * GLOBAL: Central component of the newspaper page. Receives selectedDate from parent,
 * first checks cache at /newspaper/api/cache, only triggers AI generation on cache miss
 * or explicit refresh. Notifies parent of loading/data state changes for sidebar sync.
 * 
 * EXPORTS: NewspaperContent (React component)
 * 
 * PROPS:
 * - selectedDate: string | null - The date to generate content for (YYYY-MM-DD)
 * - onLoadingChange: (loading: boolean) => void - Callback when loading state changes
 * - onDataChange: (data) => void - Callback when data updates (for sidebar sync)
 * - forceRefresh?: boolean - When true, bypasses cache and regenerates content
 */

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import Link from 'next/link'
import { UnifiedNewspaperSchema, type UnifiedNewspaperData } from '../lib/types'
import { getCategoryStyle, getEventStyle } from './ui/helpers'

interface NewspaperContentProps {
  selectedDate: string | null
  onLoadingChange?: (isLoading: boolean) => void
  onDataChange?: (data: Partial<UnifiedNewspaperData> | undefined) => void
  forceRefresh?: number // Increment to force regeneration (bypasses cache)
}

interface CacheResponse {
  data: UnifiedNewspaperData
  messageCount: number
  uniqueUsers: number
  updatedAt: string
}

/**
 * Inline skeleton that maintains the same height as text
 */
function InlineSkeleton({ width = 'w-24' }: { width?: string }) {
  return (
    <span className={`inline-block animate-pulse bg-muted/60 rounded h-[1em] ${width} align-middle`} />
  )
}

/**
 * Streaming cursor that shows when content is loading
 */
function StreamingCursor({ show }: { show: boolean }) {
  if (!show) return null
  return <span className="inline-block w-0.5 h-[1em] bg-primary/70 animate-pulse ml-0.5 align-middle" />
}

export function NewspaperContent({ 
  selectedDate, 
  onLoadingChange, 
  onDataChange,
  forceRefresh = 0
}: NewspaperContentProps) {
  // Track last loaded date and refresh key to prevent duplicate fetches
  const lastLoadedDateRef = useRef<string | null>(null)
  const lastRefreshKeyRef = useRef<number>(0)
  
  // Cache state
  const [cachedData, setCachedData] = useState<UnifiedNewspaperData | null>(null)
  const [isCacheLoading, setIsCacheLoading] = useState(false)
  const [cacheError, setCacheError] = useState<string | null>(null)
  
  // AI streaming state
  const { 
    object: newspaperData, 
    submit, 
    isLoading: isAILoading,
    error: aiError
  } = useObject({
    api: '/newspaper/api/summarize',
    schema: UnifiedNewspaperSchema,
  })

  // Track if we're showing cached vs streamed data
  const [showingCache, setShowingCache] = useState(true)
  
  // Combined data: show cache when loaded from cache, streaming data when generating
  const streamingData = newspaperData as Partial<UnifiedNewspaperData> | undefined
  const data = showingCache 
    ? (cachedData as Partial<UnifiedNewspaperData> | undefined)
    : (streamingData || cachedData as Partial<UnifiedNewspaperData> | undefined)
  
  // Combined loading state
  const isLoading = isCacheLoading || isAILoading
  const error = aiError || (cacheError ? new Error(cacheError) : null)

  // Fetch from cache
  const fetchFromCache = useCallback(async (date: string): Promise<boolean> => {
    setIsCacheLoading(true)
    setCacheError(null)
    
    try {
      const response = await fetch(`/newspaper/api/cache?date=${date}`)
      
      if (response.ok) {
        const cacheResponse: CacheResponse = await response.json()
        setCachedData(cacheResponse.data)
        setShowingCache(true)
        return true
      } else if (response.status === 404) {
        return false
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Cache fetch failed')
      }
    } catch (err) {
      console.error('[Cache]', err)
      return false
    } finally {
      setIsCacheLoading(false)
    }
  }, [])

  // Generate new content via AI
  const generateContent = useCallback((date: string) => {
    setShowingCache(false)
    setCachedData(null)
    submit({ selectedDates: [date] })
  }, [submit])

  // Notify parent of loading state changes
  useEffect(() => {
    onLoadingChange?.(isLoading)
  }, [isLoading, onLoadingChange])

  // Notify parent of data changes (for sidebar synchronization)
  useEffect(() => {
    onDataChange?.(data)
  }, [data, onDataChange])

  // Load content when date changes: check cache first, generate if not found
  useEffect(() => {
    if (!selectedDate) return
    
    const isNewDate = selectedDate !== lastLoadedDateRef.current
    const isRefreshTriggered = forceRefresh > lastRefreshKeyRef.current
    
    if (isNewDate) {
      lastLoadedDateRef.current = selectedDate
      lastRefreshKeyRef.current = forceRefresh
      
      fetchFromCache(selectedDate).then((cacheHit) => {
        if (!cacheHit) generateContent(selectedDate)
      })
    } else if (isRefreshTriggered) {
      lastRefreshKeyRef.current = forceRefresh
      generateContent(selectedDate)
    }
  }, [selectedDate, forceRefresh, fetchFromCache, generateContent])

  // Manual regeneration handler - always bypasses cache
  const handleRegenerate = () => {
    if (selectedDate) {
      generateContent(selectedDate)
    }
  }

  // Error state
  if (error) {
    return (
      <div className="p-4 bg-destructive/10 border border-destructive/30 rounded text-sm text-destructive">
        Fehler: {error.message}
        <button onClick={handleRegenerate} className="ml-2 underline">
          Erneut versuchen
        </button>
      </div>
    )
  }

  // Check if specific fields are still streaming
  const isFeaturedStreaming = isLoading && (!data?.featuredArticle?.summary || data.featuredArticle.summary.length < 50)
  const isSecondaryStreaming = isLoading && (!data?.secondaryArticle?.summary || data.secondaryArticle.summary.length < 50)

  return (
    <>
      {/* Featured Article - Fixed structure */}
      <article className="mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-foreground/20">
        {/* Meta row - fixed height */}
        <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap min-h-[20px]">
          <span className="text-[10px] sm:text-xs font-headline uppercase tracking-wider text-muted-foreground">
            {data?.featuredArticle?.author || <InlineSkeleton width="w-20" />}
          </span>
          <span className="text-muted-foreground">•</span>
          <span className="text-[10px] sm:text-xs text-muted-foreground">
            {selectedDate || 'Heute'}
          </span>
          <span className={`ml-auto px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded border min-w-[60px] text-center ${
            data?.featuredArticle?.category 
              ? getCategoryStyle(data.featuredArticle.category)
              : 'bg-muted/40 border-muted text-muted-foreground'
          }`}>
            {data?.featuredArticle?.category || <InlineSkeleton width="w-12" />}
          </span>
        </div>
        
        {/* Headline - fixed min-height for 2 lines */}
        <h3 className="font-headline text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold leading-tight mb-3 sm:mb-4 hover:text-primary/80 cursor-pointer transition-colors min-h-[2.4em]">
          {data?.featuredArticle?.headline || <InlineSkeleton width="w-full" />}
          <StreamingCursor show={isLoading && !!data?.featuredArticle?.headline && !data?.featuredArticle?.summary} />
        </h3>
        
        {/* Summary - fixed min-height for 3 lines */}
        <p className="font-body text-sm sm:text-base md:text-lg leading-relaxed text-muted-foreground mb-3 sm:mb-4 min-h-[4.5em]">
          {data?.featuredArticle?.summary || <><InlineSkeleton width="w-full" /> <InlineSkeleton width="w-full" /> <InlineSkeleton width="w-2/3" /></>}
          <StreamingCursor show={isFeaturedStreaming && !!data?.featuredArticle?.summary} />
        </p>

        {/* Quote - appears when available, space reserved */}
        <div className="min-h-[48px] mb-3 sm:mb-4">
          {data?.featuredArticle?.quote && (
            <div className="relative pl-4 py-2 border-l-2 border-foreground/20">
              <p className="text-sm text-muted-foreground italic">
                „{data.featuredArticle.quote.text}" 
                <span className="font-semibold not-italic ml-1">
                  — @{data.featuredArticle.quote.from}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Contributors - fixed min-height */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-4 min-h-[28px]">
          {data?.featuredArticle?.contributors && data.featuredArticle.contributors.length > 0 ? (
            data.featuredArticle.contributors.map((contributor, idx) => (
              <span 
                key={idx} 
                className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted text-[10px] sm:text-xs font-body rounded"
              >
                @{contributor}
              </span>
            ))
          ) : isLoading ? (
            <>
              <span className="px-2 py-1 bg-muted/40 rounded animate-pulse w-16 h-6" />
              <span className="px-2 py-1 bg-muted/40 rounded animate-pulse w-20 h-6" />
            </>
          ) : null}
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm">
          <Link href="/" className="text-primary font-headline hover:underline">
            Weiterlesen →
          </Link>
        </div>
      </article>

      {/* Secondary Article - Fixed structure */}
      <article className="mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-foreground/20">
        {/* Meta row */}
        <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap min-h-[20px]">
          <span className="text-[10px] sm:text-xs font-headline uppercase tracking-wider text-muted-foreground">
            {data?.secondaryArticle?.author || <InlineSkeleton width="w-24" />}
          </span>
          <span className="text-muted-foreground">•</span>
          <span className="text-[10px] sm:text-xs text-muted-foreground">
            {selectedDate || 'Heute'}
          </span>
          <span className={`ml-auto px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded border min-w-[60px] text-center ${
            data?.secondaryArticle?.category 
              ? getCategoryStyle(data.secondaryArticle.category)
              : 'bg-muted/40 border-muted text-muted-foreground'
          }`}>
            {data?.secondaryArticle?.category || <InlineSkeleton width="w-12" />}
          </span>
        </div>
        
        {/* Headline */}
        <h3 className="font-headline text-lg sm:text-xl md:text-2xl font-bold leading-tight mb-2 sm:mb-3 hover:text-primary/80 cursor-pointer transition-colors min-h-[2em]">
          {data?.secondaryArticle?.headline || <InlineSkeleton width="w-full" />}
          <StreamingCursor show={isLoading && !!data?.secondaryArticle?.headline && !data?.secondaryArticle?.summary} />
        </h3>
        
        {/* Summary */}
        <p className="font-body text-sm sm:text-base leading-relaxed text-muted-foreground mb-3 sm:mb-4 min-h-[3em]">
          {data?.secondaryArticle?.summary || <><InlineSkeleton width="w-full" /> <InlineSkeleton width="w-full" /> <InlineSkeleton width="w-1/2" /></>}
          <StreamingCursor show={isSecondaryStreaming && !!data?.secondaryArticle?.summary} />
        </p>

        {/* Quote */}
        <div className="min-h-[40px] mb-3 sm:mb-4">
          {data?.secondaryArticle?.quote && (
            <div className="relative pl-4 py-2 border-l-2 border-foreground/20">
              <p className="text-sm text-muted-foreground italic">
                „{data.secondaryArticle.quote.text}" 
                <span className="font-semibold not-italic ml-1">
                  — @{data.secondaryArticle.quote.from}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Contributors */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3 min-h-[24px]">
          {data?.secondaryArticle?.contributors && data.secondaryArticle.contributors.length > 0 ? (
            data.secondaryArticle.contributors.map((contributor, idx) => (
              <span 
                key={idx} 
                className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted text-[10px] sm:text-xs font-body rounded"
              >
                @{contributor}
              </span>
            ))
          ) : isLoading ? (
            <>
              <span className="px-2 py-1 bg-muted/40 rounded animate-pulse w-16 h-6" />
              <span className="px-2 py-1 bg-muted/40 rounded animate-pulse w-20 h-6" />
            </>
          ) : null}
        </div>
      </article>

      {/* Events Section - Fixed structure with 2 event slots */}
      <div className="mt-6 sm:mt-8">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-foreground/20">
          <h3 className="font-headline text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            <span className="text-amber-500">⚡</span> Chat-Momente
            {data?.events && data.events.length > 0 && (
              <span className="text-[10px] font-normal text-muted-foreground">
                ({data.events.length})
              </span>
            )}
          </h3>
        </div>
        
        {/* Always render 2 event slots to prevent layout shift */}
        <div className="space-y-4">
          {[0, 1].map((slotIdx) => {
            const event = data?.events?.[slotIdx]
            const isEventLoading = isLoading && !event?.summary
            
            return (
              <div 
                key={slotIdx} 
                className={`p-3 sm:p-4 border border-foreground/20 bg-muted/20 rounded-sm min-h-[120px] transition-opacity duration-300 ${
                  !event && !isLoading ? 'opacity-0 h-0 min-h-0 p-0 border-0 overflow-hidden' : ''
                }`}
              >
                {/* Event type badge */}
                <div className="flex items-center gap-2 mb-2 flex-wrap min-h-[24px]">
                  <span className={`px-2 py-0.5 text-[10px] font-semibold rounded min-w-[60px] text-center ${
                    event?.type ? getEventStyle(event.type) : 'bg-muted/60 text-muted-foreground'
                  }`}>
                    {event?.type?.toUpperCase() || <InlineSkeleton width="w-10" />}
                  </span>
                </div>
                
                {/* Title */}
                <h4 className="font-headline text-sm sm:text-base font-semibold mb-2 min-h-[1.5em]">
                  {event?.title || <InlineSkeleton width="w-3/4" />}
                  <StreamingCursor show={isEventLoading && !!event?.title} />
                </h4>
                
                {/* Summary */}
                <p className="text-xs sm:text-sm text-muted-foreground font-body mb-3 min-h-[2.5em]">
                  {event?.summary || <><InlineSkeleton width="w-full" /> <InlineSkeleton width="w-2/3" /></>}
                </p>
                
                {/* Participants */}
                <div className="flex flex-wrap gap-1.5 min-h-[20px]">
                  {event?.participants && event.participants.length > 0 ? (
                    event.participants.map((participant, pIdx) => (
                      <span 
                        key={pIdx} 
                        className="px-1.5 py-0.5 bg-background text-[10px] font-body rounded border border-foreground/10"
                      >
                        @{participant}
                      </span>
                    ))
                  ) : isLoading ? (
                    <>
                      <span className="px-1.5 py-0.5 bg-muted/40 rounded animate-pulse w-14 h-5" />
                      <span className="px-1.5 py-0.5 bg-muted/40 rounded animate-pulse w-16 h-5" />
                    </>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* More Articles Grid - Fixed 4 slots */}
      <div className="mt-6 sm:mt-8">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-foreground/20">
          <h3 className="font-headline text-sm font-bold uppercase tracking-wider">
            Weitere Themen
          </h3>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {[0, 1, 2, 3].map((slotIdx) => {
            const article = data?.moreArticles?.[slotIdx]
            
            return (
              <article 
                key={slotIdx} 
                className={`pb-3 sm:pb-4 border-b border-foreground/10 min-h-[80px] transition-opacity duration-300 ${
                  !article && !isLoading ? 'opacity-0 h-0 min-h-0 pb-0 border-0 overflow-hidden' : ''
                }`}
              >
                {/* Category */}
                <span className="text-[10px] sm:text-xs text-muted-foreground font-headline uppercase tracking-wider">
                  {article?.category || <InlineSkeleton width="w-16" />}
                </span>
                
                {/* Headline */}
                <h4 className="font-headline text-sm sm:text-base font-semibold mt-1 hover:text-primary/80 cursor-pointer transition-colors min-h-[1.5em]">
                  {article?.headline || <InlineSkeleton width="w-full" />}
                </h4>
                
                {/* Teaser */}
                <p className="text-xs sm:text-sm text-muted-foreground font-body mt-1 min-h-[1.2em]">
                  {article?.teaser || <InlineSkeleton width="w-3/4" />}
                </p>
              </article>
            )
          })}
        </div>
      </div>
    </>
  )
}
