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

import { useEffect, useRef, useState, useCallback, useTransition } from 'react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UnifiedNewspaperSchema, type UnifiedNewspaperData, type ArticleData, type MoreArticleData } from '../lib/types'
import { getCategoryStyle, getEventStyle } from './ui/helpers'
import { ContributorAvatar, prefetchAvatars } from './ContributorAvatar'
import { useAvatarContext } from './AvatarContext'

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
 * Build article detail URL with all necessary params
 */
function buildArticleUrl(
  type: 'featured' | 'secondary' | 'more' | 'event',
  article: Partial<ArticleData> | Partial<MoreArticleData>,
  selectedDate: string,
  dayRange: number
): string {
  const headline = article.headline || ''
  const slug = generateSlug(headline)
  
  const params = new URLSearchParams()
  params.set('type', type)
  params.set('headline', headline)
  params.set('category', article.category || '')
  params.set('date', selectedDate)
  params.set('dayRange', String(dayRange))
  
  // Add type-specific fields
  if ('summary' in article && article.summary) {
    params.set('summary', article.summary)
  }
  if ('teaser' in article && article.teaser) {
    params.set('summary', article.teaser) // Use teaser as summary for more articles
  }
  if ('author' in article && article.author) {
    params.set('author', article.author)
  }
  if ('contributors' in article && article.contributors) {
    params.set('contributors', article.contributors.join(','))
  }
  if ('quote' in article && article.quote) {
    params.set('quote', encodeURIComponent(JSON.stringify(article.quote)))
  }
  
  return `/newspaper/article/${slug}?${params.toString()}`
}

interface NewspaperContentProps {
  selectedDate: string | null
  selectedDates?: string[] // For multi-day summaries (3-day, 7-day)
  dayRange?: 1 | 3 | 7 // Number of days for the summary
  onLoadingChange?: (isLoading: boolean) => void
  onDataChange?: (data: Partial<UnifiedNewspaperData> | undefined) => void
  onCacheInfoChange?: (info: CacheInfo | null) => void // Callback for cache metadata
  forceRefresh?: number // Increment to force regeneration (bypasses cache)
}

interface CacheResponse {
  data: UnifiedNewspaperData
  messageCount: number
  uniqueUsers: number
  updatedAt: string
  dayRange: number
}

export interface CacheInfo {
  updatedAt: string
  dayRange: number
  messageCount: number
  isFromCache: boolean
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

/**
 * NavigatingLink - A Link component with instant visual feedback during navigation
 * Shows a loading spinner immediately when clicked
 */
function NavigatingLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isNavigating, setIsNavigating] = useState(false)
  
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    setIsNavigating(true)
    startTransition(() => {
      router.push(href)
    })
  }
  
  const showLoading = isPending || isNavigating
  
  return (
    <Link 
      href={href}
      onClick={handleClick}
      className={`${className} ${showLoading ? 'pointer-events-none' : ''}`}
      prefetch={false}
    >
      {showLoading ? (
        <span className="inline-flex items-center gap-1.5">
          <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Lädt...</span>
        </span>
      ) : (
        children
      )}
    </Link>
  )
}

/**
 * Check if a TradingView chart URL is valid and complete
 */
function isValidChartUrl(url: string | undefined): boolean {
  if (!url) return false
  // Must be a complete TradingView chart URL
  return url.includes('tradingview.com/x/') || url.includes('tradingview.com/chart/')
}

/**
 * Convert TradingView chart URL to embeddable image URL
 */
function getChartImageUrl(url: string): string {
  // TradingView /x/ URLs can be loaded as images with .png extension
  if (url.includes('/x/')) {
    // Extract the chart ID and create image URL
    const match = url.match(/\/x\/([A-Za-z0-9]+)/)
    if (match) {
      return `https://www.tradingview.com/x/${match[1]}/`
    }
  }
  return url
}

/**
 * Chart image component for displaying TradingView charts
 * Newspaper-style: floated image with text wrap, minimal styling
 * Features: hover to scale up, click to open lightbox
 */
function ChartImageDisplay({ 
  url, 
  caption, 
  author,
  float = 'right'
}: { 
  url: string
  caption?: string
  author?: string
  float?: 'left' | 'right' | 'none'
}) {
  const imageUrl = getChartImageUrl(url)
  const [isOpen, setIsOpen] = useState(false)
  
  const floatClasses = {
    left: 'float-left mr-4 mb-2',
    right: 'float-right ml-4 mb-2',
    none: 'mx-auto mb-4'
  }
  
  // Close on escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [isOpen])
  
  return (
    <>
      <figure className={`${floatClasses[float]} w-[45%] min-w-[200px] max-w-[280px] relative z-10`}>
        <div 
          className="relative cursor-pointer overflow-visible"
          onClick={() => setIsOpen(true)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={caption || 'Chart'}
            className="w-full h-auto grayscale-[20%] hover:grayscale-0 hover:scale-150 hover:z-50 hover:relative hover:shadow-xl transition-all duration-300 origin-center"
            loading="lazy"
          />
        </div>
        
        {(caption || author) && (
          <figcaption className="mt-1 text-[10px] text-muted-foreground italic leading-tight">
            {caption && caption.length > 40 ? `${caption.slice(0, 40)}...` : caption}
            {author && <span className="font-medium not-italic ml-1">@{author}</span>}
          </figcaption>
        )}
      </figure>
      
      {/* Lightbox Modal */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div 
            className="relative max-w-[90vw] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute -top-10 right-0 text-white hover:text-primary transition-colors flex items-center gap-2 text-sm"
            >
              <span>Schließen</span>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* Image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={caption || 'Chart'}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
            
            {/* Caption */}
            {(caption || author) && (
              <div className="mt-3 text-center text-sm text-white/80">
                {caption}
                {author && <span className="ml-2 font-medium text-white">@{author}</span>}
              </div>
            )}
            
            {/* Open in TradingView link */}
            <a 
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center justify-center gap-2 text-xs text-white/60 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              In TradingView öffnen
            </a>
          </div>
        </div>
      )}
    </>
  )
}

export function NewspaperContent({ 
  selectedDate, 
  selectedDates,
  dayRange = 1,
  onLoadingChange, 
  onDataChange,
  onCacheInfoChange,
  forceRefresh = 0
}: NewspaperContentProps) {
  // Track last loaded date and refresh key to prevent duplicate fetches
  const lastLoadedDateRef = useRef<string | null>(null)
  const lastLoadedDatesRef = useRef<string[]>([])
  const lastDayRangeRef = useRef<number>(1)
  const lastRefreshKeyRef = useRef<number>(0)
  
  // Cache state
  const [cachedData, setCachedData] = useState<UnifiedNewspaperData | null>(null)
  const [isCacheLoading, setIsCacheLoading] = useState(false)
  const [cacheError, setCacheError] = useState<string | null>(null)
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null)
  
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

  /**
   * Check if cache is too old and should be regenerated
   * - Cache older than 1 day should be regenerated
   */
  const isCacheTooOld = useCallback((updatedAt: string): boolean => {
    const cacheTime = new Date(updatedAt).getTime()
    const now = Date.now()
    const oneDayMs = 24 * 60 * 60 * 1000 // 1 day in milliseconds
    return (now - cacheTime) > oneDayMs
  }, [])

  // Fetch from cache with dayRange support
  // Returns: { hit: boolean, needsRefresh: boolean }
  const fetchFromCache = useCallback(async (date: string, range: number): Promise<{ hit: boolean; needsRefresh: boolean }> => {
    setIsCacheLoading(true)
    setCacheError(null)
    
    try {
      const response = await fetch(`/newspaper/api/cache?date=${date}&dayRange=${range}`)
      
      if (response.ok) {
        const cacheResponse: CacheResponse = await response.json()
        
        // Check if cache is too old (older than 1 day)
        const tooOld = isCacheTooOld(cacheResponse.updatedAt)
        
        // Still show cached data while regenerating
        setCachedData(cacheResponse.data)
        setShowingCache(true)
        
        // Set cache info
        const info: CacheInfo = {
          updatedAt: cacheResponse.updatedAt,
          dayRange: cacheResponse.dayRange,
          messageCount: cacheResponse.messageCount,
          isFromCache: true
        }
        setCacheInfo(info)
        onCacheInfoChange?.(info)
        
        // Return whether cache needs refresh
        return { hit: true, needsRefresh: tooOld }
      } else if (response.status === 404) {
        setCacheInfo(null)
        onCacheInfoChange?.(null)
        return { hit: false, needsRefresh: false }
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Cache fetch failed')
      }
    } catch (err) {
      console.error('[Cache]', err)
      setCacheInfo(null)
      onCacheInfoChange?.(null)
      return { hit: false, needsRefresh: false }
    } finally {
      setIsCacheLoading(false)
    }
  }, [onCacheInfoChange, isCacheTooOld])

  // Generate new content via AI with dayRange
  const generateContent = useCallback((dates: string[], range: number) => {
    setShowingCache(false)
    setCachedData(null)
    
    // Set cache info to indicate fresh generation
    const info: CacheInfo = {
      updatedAt: new Date().toISOString(),
      dayRange: range,
      messageCount: 0, // Will be updated when complete
      isFromCache: false
    }
    setCacheInfo(info)
    onCacheInfoChange?.(info)
    
    submit({ selectedDates: dates, dayRange: range })
  }, [submit, onCacheInfoChange])

  // Notify parent of loading state changes
  useEffect(() => {
    onLoadingChange?.(isLoading)
  }, [isLoading, onLoadingChange])

  // Get avatar context to prefetch contributor avatars
  const { addAvatars: addAvatarsToContext } = useAvatarContext()

  // Notify parent of data changes (for sidebar synchronization)
  // Also prefetch avatars for all contributors
  useEffect(() => {
    onDataChange?.(data)
    
    // Extract all contributor usernames from the data and prefetch their avatars
    if (data) {
      const allContributors = new Set<string>()
      
      // Featured article contributors
      if (data.featuredArticle?.contributors) {
        data.featuredArticle.contributors.forEach(c => allContributors.add(c))
      }
      
      // Secondary article contributors
      if (data.secondaryArticle?.contributors) {
        data.secondaryArticle.contributors.forEach(c => allContributors.add(c))
      }
      
      // Note: moreArticles don't have participants/contributors in schema
      
      // Event participants
      if (data.events) {
        data.events.forEach(event => {
          if (event.participants) {
            event.participants.forEach(p => allContributors.add(p))
          }
        })
      }
      
      // Top contributors
      if (data.topContributors) {
        data.topContributors.forEach(c => allContributors.add(c.username))
      }
      
      // Prefetch all unique contributors
      if (allContributors.size > 0) {
        prefetchAvatars(Array.from(allContributors))
      }
    }
  }, [data, onDataChange, addAvatarsToContext])

  // Load content when date changes: check cache first, generate if not found or too old
  useEffect(() => {
    if (!selectedDate) return
    
    // Determine which dates to use
    const datesToUse = selectedDates && selectedDates.length > 0 ? selectedDates : [selectedDate]
    // Use the requested dayRange (1, 3, or 7) for caching, not the actual count of dates
    // This ensures we cache by the requested range, even if fewer dates are available
    const effectiveDayRange = dayRange || 1
    
    // Check if dates or dayRange have changed
    const datesKey = datesToUse.join(',')
    const lastDatesKey = lastLoadedDatesRef.current.join(',')
    const isNewDates = datesKey !== lastDatesKey
    const isDayRangeChanged = effectiveDayRange !== lastDayRangeRef.current
    const isRefreshTriggered = forceRefresh > lastRefreshKeyRef.current
    
    if (isNewDates || isDayRangeChanged) {
      lastLoadedDateRef.current = selectedDate
      lastLoadedDatesRef.current = datesToUse
      lastDayRangeRef.current = effectiveDayRange
      lastRefreshKeyRef.current = forceRefresh
      
      // Check cache using the requested dayRange (1, 3, or 7)
      // If cache is too old (> 1 day), regenerate in background
      fetchFromCache(selectedDate, effectiveDayRange).then(({ hit, needsRefresh }) => {
        if (!hit) {
          // No cache: generate new content
          generateContent(datesToUse, effectiveDayRange)
        } else if (needsRefresh) {
          // Cache is too old: show cached data but regenerate in background
          console.log('[NewspaperContent] Cache is older than 1 day, regenerating...')
          generateContent(datesToUse, effectiveDayRange)
        }
        // If hit && !needsRefresh: cache is fresh, just use it (already set in fetchFromCache)
      })
    } else if (isRefreshTriggered) {
      lastRefreshKeyRef.current = forceRefresh
      generateContent(datesToUse, effectiveDayRange)
    }
  }, [selectedDate, selectedDates, dayRange, forceRefresh, fetchFromCache, generateContent])

  // Manual regeneration handler - always bypasses cache
  const handleRegenerate = () => {
    if (selectedDate) {
      const datesToUse = selectedDates && selectedDates.length > 0 ? selectedDates : [selectedDate]
      const effectiveDayRange = dayRange || 1
      generateContent(datesToUse, effectiveDayRange)
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
        
        {/* Content area with floating chart image */}
        <div className="clearfix">
          {/* Chart Image - floated right, text wraps around */}
          {data?.featuredArticle?.chartImage && isValidChartUrl(data.featuredArticle.chartImage.url) && (
            <ChartImageDisplay
              url={data.featuredArticle.chartImage.url}
              caption={data.featuredArticle.chartImage.caption}
              author={data.featuredArticle.chartImage.author}
              float="right"
            />
          )}
          
          {/* Summary */}
          <p className="font-body text-sm sm:text-base md:text-lg leading-relaxed text-muted-foreground mb-3 sm:mb-4">
            {data?.featuredArticle?.summary || <><InlineSkeleton width="w-full" /> <InlineSkeleton width="w-full" /> <InlineSkeleton width="w-2/3" /></>}
            <StreamingCursor show={isFeaturedStreaming && !!data?.featuredArticle?.summary} />
          </p>

          {/* Quote - appears when available */}
          {data?.featuredArticle?.quote && (
            <div className="relative pl-4 py-2 border-l-2 border-foreground/20 mb-3 sm:mb-4">
              <p className="text-sm text-muted-foreground italic">
                „{data.featuredArticle.quote.text}" 
                <span className="font-semibold not-italic ml-1">
                  — @{data.featuredArticle.quote.from}
                </span>
              </p>
            </div>
          )}
        </div>
        
        {/* Clear floats */}
        <div className="clear-both" />

        {/* Contributors - fixed min-height */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-4 min-h-[28px]">
          {data?.featuredArticle?.contributors && data.featuredArticle.contributors.length > 0 ? (
            data.featuredArticle.contributors.map((contributor, idx) => (
              <span 
                key={idx} 
                className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted text-[10px] sm:text-xs font-body rounded"
              >
                <ContributorAvatar username={contributor} size="xs" />
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
          {data?.featuredArticle?.headline && data?.featuredArticle?.summary && selectedDate ? (
            <NavigatingLink 
              href={buildArticleUrl('featured', data.featuredArticle, selectedDate, dayRange)}
              className="text-primary font-headline hover:underline"
            >
              Weiterlesen →
            </NavigatingLink>
          ) : (
            <span className="text-muted-foreground font-headline">Weiterlesen →</span>
          )}
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
        
        {/* Content area with floating chart image */}
        <div className="clearfix">
          {/* Chart Image - floated left for variety */}
          {data?.secondaryArticle?.chartImage && isValidChartUrl(data.secondaryArticle.chartImage.url) && (
            <ChartImageDisplay
              url={data.secondaryArticle.chartImage.url}
              caption={data.secondaryArticle.chartImage.caption}
              author={data.secondaryArticle.chartImage.author}
              float="left"
            />
          )}
          
          {/* Summary */}
          <p className="font-body text-sm sm:text-base leading-relaxed text-muted-foreground mb-3 sm:mb-4">
            {data?.secondaryArticle?.summary || <><InlineSkeleton width="w-full" /> <InlineSkeleton width="w-full" /> <InlineSkeleton width="w-1/2" /></>}
            <StreamingCursor show={isSecondaryStreaming && !!data?.secondaryArticle?.summary} />
          </p>

          {/* Quote */}
          {data?.secondaryArticle?.quote && (
            <div className="relative pl-4 py-2 border-l-2 border-foreground/20 mb-3 sm:mb-4">
              <p className="text-sm text-muted-foreground italic">
                „{data.secondaryArticle.quote.text}" 
                <span className="font-semibold not-italic ml-1">
                  — @{data.secondaryArticle.quote.from}
                </span>
              </p>
            </div>
          )}
        </div>
        
        {/* Clear floats */}
        <div className="clear-both" />

        {/* Contributors */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3 min-h-[24px]">
          {data?.secondaryArticle?.contributors && data.secondaryArticle.contributors.length > 0 ? (
            data.secondaryArticle.contributors.map((contributor, idx) => (
              <span 
                key={idx} 
                className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted text-[10px] sm:text-xs font-body rounded"
              >
                <ContributorAvatar username={contributor} size="xs" />
              </span>
            ))
          ) : isLoading ? (
            <>
              <span className="px-2 py-1 bg-muted/40 rounded animate-pulse w-16 h-6" />
              <span className="px-2 py-1 bg-muted/40 rounded animate-pulse w-20 h-6" />
            </>
          ) : null}
        </div>
        
        {/* Weiterlesen Link */}
        <div className="text-sm">
          {data?.secondaryArticle?.headline && data?.secondaryArticle?.summary && selectedDate ? (
            <NavigatingLink 
              href={buildArticleUrl('secondary', data.secondaryArticle, selectedDate, dayRange)}
              className="text-primary font-headline hover:underline"
            >
              Weiterlesen →
            </NavigatingLink>
          ) : (
            <span className="text-muted-foreground font-headline">Weiterlesen →</span>
          )}
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
                        <ContributorAvatar username={participant} size="xs" />
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
                className={`pb-3 sm:pb-4 border-b border-foreground/10 min-h-[100px] transition-opacity duration-300 ${
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
                
                {/* Weiterlesen Link */}
                {article?.headline && article?.teaser && selectedDate && (
                  <NavigatingLink 
                    href={buildArticleUrl('more', article, selectedDate, dayRange)}
                    className="text-xs text-primary font-headline hover:underline mt-2 inline-block"
                  >
                    Weiterlesen →
                  </NavigatingLink>
                )}
              </article>
            )
          })}
        </div>
      </div>
    </>
  )
}
