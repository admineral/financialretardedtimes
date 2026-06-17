/**
 * NewspaperContent.tsx
 * 
 * REDESIGNED: Premium dark edition with glassmorphism cards
 * 
 * Features:
 * - Bold article cards with gold accents
 * - Dramatic typography hierarchy
 * - Smooth streaming animations
 * - Floating chart images with lightbox
 */

'use client'

import { experimental_useObject as useObject } from '@ai-sdk/react'
import { ChevronRight,Loader2,Quote,Sparkles,Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback,useEffect,useRef,useState,useTransition } from 'react'
import { createPortal } from 'react-dom'
import { NewspaperAISchema,type ArticleData,type MoreArticleData,type UnifiedNewspaperData } from '../lib/types'
import { useAvatarContext } from './AvatarContext'
import { ContributorAvatar,prefetchAvatars } from './ContributorAvatar'
import { getCategoryStyle,getEventStyle } from './ui/helpers'

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
  if ('summary' in article && article.summary) params.set('summary', article.summary)
  if ('teaser' in article && article.teaser) params.set('summary', article.teaser)
  if ('author' in article && article.author) params.set('author', article.author)
  if ('contributors' in article && article.contributors) params.set('contributors', article.contributors.join(','))
  if ('quote' in article && article.quote) params.set('quote', encodeURIComponent(JSON.stringify(article.quote)))
  return `/newspaper/article/${slug}?${params.toString()}`
}

interface NewspaperContentProps {
  selectedDate: string | null
  selectedDates?: string[]
  dayRange?: 1 | 3 | 7
  onLoadingChange?: (isLoading: boolean) => void
  onDataChange?: (data: Partial<UnifiedNewspaperData> | undefined) => void
  onCacheInfoChange?: (info: CacheInfo | null) => void
  forceRefresh?: number
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

function Skeleton({ className = '', inline = false }: { className?: string; inline?: boolean }) {
  // Use span for inline contexts (inside <p> tags), div for block contexts
  const Component = inline ? 'span' : 'div'
  return <Component className={`${inline ? 'inline-block' : 'block'} animate-pulse bg-primary/10 rounded ${className}`} />
}

function StreamingCursor({ show }: { show: boolean }) {
  if (!show) return null
  return <span className="inline-block w-0.5 h-[1em] bg-primary animate-pulse ml-1 align-middle" />
}

function NavigatingLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    startTransition(() => {
      router.push(href)
    })
  }
  
  return (
    <button 
      onClick={handleClick} 
      className={className}
      disabled={isPending}
    >
      {isPending ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Laden...</span>
        </>
      ) : (
        children
      )}
    </button>
  )
}

function isValidChartUrl(url: string | undefined): boolean {
  if (!url) return false
  return url.includes('tradingview.com/x/') || url.includes('tradingview.com/chart/')
}

function getChartImageUrl(url: string): string {
  if (url.includes('/x/')) {
    const match = url.match(/\/x\/([A-Za-z0-9]+)/)
    if (match) return `https://www.tradingview.com/x/${match[1]}/`
  }
  return url
}

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
  const [mounted, setMounted] = useState(false)
  
  const floatClasses = {
    left: 'float-left mr-6 mb-4',
    right: 'float-right ml-6 mb-4',
    none: 'mx-auto mb-6'
  }
  
  // Ensure we only use portal on client side
  useEffect(() => {
    setMounted(true)
  }, [])
  
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
  
  const modalContent = isOpen && mounted ? (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-md"
      onClick={() => setIsOpen(false)}
    >
      <div className="relative max-w-[90vw] max-h-[90vh] bg-white dark:bg-card p-4 rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setIsOpen(false)}
          className="absolute -top-12 right-0 text-white/80 hover:text-white transition-colors flex items-center gap-2 text-sm"
        >
          <span>Schließen</span>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={caption || 'Chart'}
          className="max-w-full max-h-[85vh] object-contain rounded-sm border border-gray-200 dark:border-primary/30 shadow-xl"
        />
        {(caption || author) && (
          <div className="mt-4 text-center text-sm text-gray-600 dark:text-muted-foreground">
            {caption}
            {author && <span className="ml-2 font-medium text-primary">@{author}</span>}
          </div>
        )}
        <a 
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-muted-foreground hover:text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          In TradingView öffnen
        </a>
      </div>
    </div>
  ) : null
  
  return (
    <>
      <figure className={`${floatClasses[float]} w-[45%] min-w-[200px] max-w-[300px] relative z-10`}>
        <div 
          className="relative cursor-pointer overflow-visible group"
          onClick={() => setIsOpen(true)}
        >
          <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-sm" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={caption || 'Chart'}
            className="w-full h-auto rounded-sm border border-primary/20 hover:border-primary/50 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-primary/20"
            loading="lazy"
          />
        </div>
        
        {(caption || author) && (
          <figcaption className="mt-2 text-[10px] text-muted-foreground italic leading-tight">
            {caption && caption.length > 50 ? `${caption.slice(0, 50)}...` : caption}
            {author && <span className="font-medium not-italic text-primary/70 ml-1">@{author}</span>}
          </figcaption>
        )}
      </figure>
      
      {/* Lightbox Modal - Rendered via Portal to escape container constraints */}
      {mounted && modalContent && createPortal(modalContent, document.body)}
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
  const lastLoadedDateRef = useRef<string | null>(null)
  const lastLoadedDatesRef = useRef<string[]>([])
  const lastDayRangeRef = useRef<number>(1)
  const lastRefreshKeyRef = useRef<number>(0)
  
  const [cachedData, setCachedData] = useState<UnifiedNewspaperData | null>(null)
  const [isCacheLoading, setIsCacheLoading] = useState(false)
  const [cacheError, setCacheError] = useState<string | null>(null)
  const [, setCacheInfo] = useState<CacheInfo | null>(null)
  
  const { 
    object: newspaperData, 
    submit, 
    isLoading: isAILoading,
    error: aiError
  } = useObject({
    api: '/newspaper/api/summarize',
    schema: NewspaperAISchema,
  })

  const [showingCache, setShowingCache] = useState(true)
  const streamingData = newspaperData as Partial<UnifiedNewspaperData> | undefined
  const data = showingCache 
    ? (cachedData as Partial<UnifiedNewspaperData> | undefined)
    : (streamingData || cachedData as Partial<UnifiedNewspaperData> | undefined)
  
  const isLoading = isCacheLoading || isAILoading
  const error = aiError || (cacheError ? new Error(cacheError) : null)

  const isCacheTooOld = useCallback((updatedAt: string): boolean => {
    const cacheTime = new Date(updatedAt).getTime()
    const now = Date.now()
    const oneDayMs = 24 * 60 * 60 * 1000
    return (now - cacheTime) > oneDayMs
  }, [])

  const fetchFromCache = useCallback(async (date: string, range: number): Promise<{ hit: boolean; needsRefresh: boolean }> => {
    setIsCacheLoading(true)
    setCacheError(null)
    
    try {
      const response = await fetch(`/newspaper/api/cache?date=${date}&dayRange=${range}`)
      if (response.ok) {
        const cacheResponse: CacheResponse = await response.json()
        const tooOld = isCacheTooOld(cacheResponse.updatedAt)
        setCachedData(cacheResponse.data)
        setShowingCache(true)
        const info: CacheInfo = {
          updatedAt: cacheResponse.updatedAt,
          dayRange: cacheResponse.dayRange,
          messageCount: cacheResponse.messageCount,
          isFromCache: true
        }
        setCacheInfo(info)
        onCacheInfoChange?.(info)
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

  const generateContent = useCallback((dates: string[], range: number) => {
    setShowingCache(false)
    setCachedData(null)
    const info: CacheInfo = {
      updatedAt: new Date().toISOString(),
      dayRange: range,
      messageCount: 0,
      isFromCache: false
    }
    setCacheInfo(info)
    onCacheInfoChange?.(info)
    submit({ selectedDates: dates, dayRange: range })
  }, [submit, onCacheInfoChange])

  useEffect(() => {
    onLoadingChange?.(isLoading)
  }, [isLoading, onLoadingChange])

  const { addAvatars: addAvatarsToContext } = useAvatarContext()

  useEffect(() => {
    onDataChange?.(data)
    if (data) {
      const allContributors = new Set<string>()
      if (data.featuredArticle?.contributors) data.featuredArticle.contributors.forEach(c => allContributors.add(c))
      if (data.secondaryArticle?.contributors) data.secondaryArticle.contributors.forEach(c => allContributors.add(c))
      if (data.events) data.events.forEach(event => { if (event.participants) event.participants.forEach(p => allContributors.add(p)) })
      if (data.topContributors) data.topContributors.forEach(c => allContributors.add(c.username))
      if (allContributors.size > 0) prefetchAvatars(Array.from(allContributors))
    }
  }, [data, onDataChange, addAvatarsToContext])

  useEffect(() => {
    if (!selectedDate) return
    const datesToUse = selectedDates && selectedDates.length > 0 ? selectedDates : [selectedDate]
    const effectiveDayRange = dayRange || 1
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
      
      fetchFromCache(selectedDate, effectiveDayRange).then(({ hit, needsRefresh }) => {
        if (!hit) generateContent(datesToUse, effectiveDayRange)
        else if (needsRefresh) generateContent(datesToUse, effectiveDayRange)
      })
    } else if (isRefreshTriggered) {
      lastRefreshKeyRef.current = forceRefresh
      generateContent(datesToUse, effectiveDayRange)
    }
  }, [selectedDate, selectedDates, dayRange, forceRefresh, fetchFromCache, generateContent])

  const handleRegenerate = () => {
    if (selectedDate) {
      const datesToUse = selectedDates && selectedDates.length > 0 ? selectedDates : [selectedDate]
      const effectiveDayRange = dayRange || 1
      generateContent(datesToUse, effectiveDayRange)
    }
  }

  if (error) {
    return (
      <div className="p-6 bg-destructive/10 border border-destructive/30 rounded-sm text-sm text-destructive">
        <span className="font-semibold">Fehler:</span> {error.message}
        <button onClick={handleRegenerate} className="ml-3 underline hover:no-underline">
          Erneut versuchen
        </button>
      </div>
    )
  }

  const isFeaturedStreaming = isLoading && (!data?.featuredArticle?.summary || data.featuredArticle.summary.length < 50)
  const isSecondaryStreaming = isLoading && (!data?.secondaryArticle?.summary || data.secondaryArticle.summary.length < 50)

  return (
    <div className="space-y-8">
      {/* Featured Article - Hero Card */}
      <article className="glass-card-gold p-6 sm:p-8 rounded-sm relative overflow-hidden">
        {/* Decorative corner */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/10 to-transparent pointer-events-none" />
        
        {/* Meta row */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className={`px-3 py-1 text-xs font-semibold rounded-sm border ${
            data?.featuredArticle?.category 
              ? getCategoryStyle(data.featuredArticle.category)
              : 'bg-muted/40 border-muted text-muted-foreground'
          }`}>
            {data?.featuredArticle?.category || <Skeleton className="w-16 h-4" />}
          </span>
          <span className="text-xs text-muted-foreground/60">•</span>
          <span className="text-xs text-muted-foreground font-headline uppercase tracking-wider">
            {data?.featuredArticle?.author || <Skeleton className="w-20 h-4 inline-block" />}
          </span>
          <span className="text-xs text-muted-foreground/60">•</span>
          <span className="text-xs text-muted-foreground">
            {selectedDate || 'Heute'}
          </span>
        </div>
        
        {/* Headline */}
        <h3 className="font-headline text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight mb-5 text-foreground hover:text-primary/90 transition-colors cursor-pointer">
          {data?.featuredArticle?.headline || <Skeleton className="w-full h-10" />}
          <StreamingCursor show={isLoading && !!data?.featuredArticle?.headline && !data?.featuredArticle?.summary} />
        </h3>
        
        {/* Content with chart */}
        <div className="clearfix">
          {data?.featuredArticle?.chartImage && isValidChartUrl(data.featuredArticle.chartImage.url) && (
            <ChartImageDisplay
              url={data.featuredArticle.chartImage.url}
              caption={data.featuredArticle.chartImage.caption}
              author={data.featuredArticle.chartImage.author}
              float="right"
            />
          )}
          
          <div className="font-body text-base sm:text-lg leading-relaxed text-muted-foreground mb-5">
            {data?.featuredArticle?.summary || (
              <>
                <Skeleton className="w-full h-5 mb-2" />
                <Skeleton className="w-full h-5 mb-2" />
                <Skeleton className="w-3/4 h-5" />
              </>
            )}
            <StreamingCursor show={isFeaturedStreaming && !!data?.featuredArticle?.summary} />
          </div>

          {/* Quote */}
          {data?.featuredArticle?.quote && (
            <div className="relative pl-5 py-3 border-l-2 border-primary/40 mb-5 bg-primary/5 rounded-r-sm">
              <Quote className="absolute -left-3 top-3 w-6 h-6 text-primary/30" />
              <p className="text-sm sm:text-base text-muted-foreground italic">
                „{data.featuredArticle.quote.text}“ 
                <span className="font-semibold not-italic text-primary/80 ml-2">
                  — @{data.featuredArticle.quote.from}
                </span>
              </p>
            </div>
          )}
        </div>
        
        <div className="clear-both" />

        {/* Contributors & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-6 pt-5 border-t border-primary/20">
          <div className="flex flex-wrap gap-2">
            {data?.featuredArticle?.contributors && data.featuredArticle.contributors.length > 0 ? (
              data.featuredArticle.contributors.map((contributor, idx) => (
                <span 
                  key={idx} 
                  className="px-3 py-1.5 bg-card/80 text-xs font-body rounded-full border border-primary/10"
                >
                  <ContributorAvatar username={contributor} size="xs" />
                </span>
              ))
            ) : isLoading ? (
              <>
                <Skeleton className="w-20 h-7 rounded-full" />
                <Skeleton className="w-24 h-7 rounded-full" />
              </>
            ) : null}
          </div>
          
          {data?.featuredArticle?.headline && data?.featuredArticle?.summary && selectedDate && (
            <NavigatingLink 
              href={buildArticleUrl('featured', data.featuredArticle, selectedDate, dayRange)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary text-sm font-headline rounded-sm transition-all hover:translate-x-1"
            >
              Vollständiger Artikel
              <ChevronRight className="w-4 h-4" />
            </NavigatingLink>
          )}
        </div>
      </article>

      {/* Secondary Article - Standard Card */}
      <article className="glass-card p-6 rounded-sm relative">
        {/* Meta row */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-sm border ${
            data?.secondaryArticle?.category 
              ? getCategoryStyle(data.secondaryArticle.category)
              : 'bg-muted/40 border-muted text-muted-foreground'
          }`}>
            {data?.secondaryArticle?.category || <Skeleton className="w-14 h-4" />}
          </span>
          <span className="text-xs text-muted-foreground font-headline uppercase tracking-wider">
            {data?.secondaryArticle?.author || <Skeleton className="w-20 h-4 inline-block" />}
          </span>
        </div>
        
        {/* Headline */}
        <h3 className="font-headline text-xl sm:text-2xl font-bold leading-tight mb-4 text-foreground hover:text-primary/90 transition-colors cursor-pointer">
          {data?.secondaryArticle?.headline || <Skeleton className="w-full h-7" />}
          <StreamingCursor show={isLoading && !!data?.secondaryArticle?.headline && !data?.secondaryArticle?.summary} />
        </h3>
        
        {/* Content */}
        <div className="clearfix">
          {data?.secondaryArticle?.chartImage && isValidChartUrl(data.secondaryArticle.chartImage.url) && (
            <ChartImageDisplay
              url={data.secondaryArticle.chartImage.url}
              caption={data.secondaryArticle.chartImage.caption}
              author={data.secondaryArticle.chartImage.author}
              float="left"
            />
          )}
          
          <div className="font-body text-sm sm:text-base leading-relaxed text-muted-foreground mb-4">
            {data?.secondaryArticle?.summary || (
              <>
                <Skeleton className="w-full h-4 mb-2" />
                <Skeleton className="w-full h-4 mb-2" />
                <Skeleton className="w-2/3 h-4" />
              </>
            )}
            <StreamingCursor show={isSecondaryStreaming && !!data?.secondaryArticle?.summary} />
          </div>

          {data?.secondaryArticle?.quote && (
            <div className="pl-4 py-2 border-l-2 border-primary/30 mb-4">
              <p className="text-sm text-muted-foreground italic">
                „{data.secondaryArticle.quote.text}“ 
                <span className="font-semibold not-italic text-primary/70 ml-1">
                  — @{data.secondaryArticle.quote.from}
                </span>
              </p>
            </div>
          )}
        </div>
        
        <div className="clear-both" />

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-primary/10">
          <div className="flex flex-wrap gap-1.5">
            {data?.secondaryArticle?.contributors && data.secondaryArticle.contributors.length > 0 ? (
              data.secondaryArticle.contributors.map((contributor, idx) => (
                <span 
                  key={idx} 
                  className="px-2 py-1 bg-card text-[11px] font-body rounded-full border border-primary/10"
                >
                  <ContributorAvatar username={contributor} size="xs" />
                </span>
              ))
            ) : isLoading ? (
              <>
                <Skeleton className="w-16 h-6 rounded-full" />
                <Skeleton className="w-20 h-6 rounded-full" />
              </>
            ) : null}
          </div>
          
          {data?.secondaryArticle?.headline && data?.secondaryArticle?.summary && selectedDate && (
            <NavigatingLink 
              href={buildArticleUrl('secondary', data.secondaryArticle, selectedDate, dayRange)}
              className="text-sm text-primary font-headline hover:underline inline-flex items-center gap-1"
            >
              Weiterlesen <ChevronRight className="w-3.5 h-3.5" />
            </NavigatingLink>
          )}
        </div>
      </article>

      {/* Events Section */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <Zap className="w-5 h-5 text-amber-500" />
          <h3 className="font-headline text-sm font-bold uppercase tracking-wider">
            Chat-Momente
          </h3>
          {data?.events && data.events.length > 0 && (
            <span className="text-xs text-muted-foreground/60">({data.events.length})</span>
          )}
          <div className="flex-1 h-px bg-gradient-to-r from-amber-500/30 to-transparent" />
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1].map((slotIdx) => {
            const event = data?.events?.[slotIdx]
            const isEventLoading = isLoading && !event?.summary
            
            if (!event && !isLoading) return null
            
            return (
              <div 
                key={slotIdx} 
                className="glass-card p-4 rounded-sm border-l-2 border-amber-500/40"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-sm ${
                    event?.type ? getEventStyle(event.type) : 'bg-muted/60 text-muted-foreground'
                  }`}>
                    {event?.type?.toUpperCase() || <Skeleton className="w-12 h-4" />}
                  </span>
                </div>
                
                <h4 className="font-headline text-sm sm:text-base font-semibold mb-2 text-foreground">
                  {event?.title || <Skeleton className="w-3/4 h-5" />}
                  <StreamingCursor show={isEventLoading && !!event?.title} />
                </h4>
                
                <div className="text-xs sm:text-sm text-muted-foreground font-body mb-3 leading-relaxed">
                  {event?.summary || <><Skeleton className="w-full h-4 mb-1" /><Skeleton className="w-2/3 h-4" /></>}
                </div>
                
                <div className="flex flex-wrap gap-1.5">
                  {event?.participants && event.participants.length > 0 ? (
                    event.participants.map((participant, pIdx) => (
                      <span 
                        key={pIdx} 
                        className="px-2 py-0.5 bg-amber-500/10 text-[10px] font-body rounded-full border border-amber-500/20"
                      >
                        <ContributorAvatar username={participant} size="xs" />
                      </span>
                    ))
                  ) : isLoading ? (
                    <>
                      <Skeleton className="w-14 h-5 rounded-full" />
                      <Skeleton className="w-16 h-5 rounded-full" />
                    </>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* More Articles Grid */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <Sparkles className="w-5 h-5 text-primary/70" />
          <h3 className="font-headline text-sm font-bold uppercase tracking-wider">
            Weitere Themen
          </h3>
          <div className="flex-1 h-px bg-gradient-to-r from-primary/30 to-transparent" />
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((slotIdx) => {
            const article = data?.moreArticles?.[slotIdx]
            
            if (!article && !isLoading) return null
            
            return (
              <article 
                key={slotIdx} 
                className="p-4 border border-primary/20 rounded-sm hover:border-primary/40 hover:bg-card/60 transition-all bg-card/40"
              >
                <span className="text-[10px] text-primary/70 font-headline uppercase tracking-wider">
                  {article?.category || <Skeleton className="w-16 h-3" />}
                </span>
                
                <h4 className="font-headline text-sm sm:text-base font-semibold mt-1 text-foreground hover:text-primary transition-colors cursor-pointer">
                  {article?.headline || <Skeleton className="w-full h-5" />}
                </h4>
                
                <div className="text-xs text-foreground/70 font-body mt-2 line-clamp-2">
                  {article?.teaser || <Skeleton className="w-full h-4" />}
                </div>
                
                {article?.headline && article?.teaser && selectedDate && (
                  <NavigatingLink 
                    href={buildArticleUrl('more', article, selectedDate, dayRange)}
                    className="text-xs text-primary font-headline hover:underline mt-3 inline-flex items-center gap-1"
                  >
                    Weiterlesen <ChevronRight className="w-3 h-3" />
                  </NavigatingLink>
                )}
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}
