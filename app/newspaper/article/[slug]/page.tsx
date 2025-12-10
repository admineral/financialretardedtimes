/**
 * page.tsx (Article Detail Page)
 * 
 * Dynamic page for displaying expanded article content.
 * 
 * LOCAL: Renders a full-length article generated on-the-fly from the article summary.
 * Uses URL search params to receive article context and streams expanded content from AI.
 * 
 * GLOBAL: Accessed via /newspaper/article/[slug] with article data passed via URL params.
 * The slug is a URL-safe version of the headline.
 * 
 * ROUTE: /newspaper/article/[slug]
 * 
 * SEARCH PARAMS:
 * - type: 'featured' | 'secondary' | 'more' | 'event'
 * - headline: Original headline
 * - summary: Original summary
 * - category: Article category
 * - author: Original author (optional)
 * - contributors: Comma-separated list (optional)
 * - quote: JSON encoded quote object (optional)
 * - date: Selected date (YYYY-MM-DD)
 * - dayRange: Number of days (1, 3, or 7)
 */

'use client'

import React, { useEffect, useRef, use, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { z } from 'zod'
import { ArrowLeft, Clock, Users, TrendingUp, TrendingDown, Minus, RefreshCw, Loader2, Quote, ImageIcon, ImageOff, ExternalLink } from 'lucide-react'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { Badge } from '@/components/ui/badge'
import { ContributorAvatar } from '../../components/ContributorAvatar'

/**
 * Schema for chart/image references
 */
const ChartImageSchema = z.object({
  url: z.string(),
  caption: z.string(),
  author: z.string().optional()
})

/**
 * Schema for quotes with styling info
 */
const StyledQuoteSchema = z.object({
  text: z.string(),
  from: z.string(),
  context: z.string().optional(),
  sentiment: z.enum(['bullish', 'bearish', 'neutral', 'humor']).optional()
})

/**
 * Schema for expanded article (must match API)
 */
const ExpandedArticleSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  headerImage: ChartImageSchema.optional(),
  introduction: z.string(),
  featuredQuote: StyledQuoteSchema.optional(),
  sections: z.array(z.object({
    heading: z.string(),
    content: z.string(),
    quote: StyledQuoteSchema.optional(),
    inlineImage: ChartImageSchema.optional()
  })).min(2).max(3),
  keyTakeaways: z.array(z.string()).min(2).max(3),
  conclusion: z.string(),
  relatedTopics: z.array(z.string()).min(2).max(3),
  sentiment: z.enum(['bullish', 'bearish', 'neutral', 'mixed']),
  mentionedUsers: z.array(z.object({
    username: z.string(),
    role: z.string()
  })).min(1).max(4),
  chartGallery: z.array(ChartImageSchema).max(2).optional()
})

type ExpandedArticleData = z.infer<typeof ExpandedArticleSchema>
type ChartImage = z.infer<typeof ChartImageSchema>
type StyledQuote = z.infer<typeof StyledQuoteSchema>

/**
 * Render text with clickable links (images come from schema fields, not from text parsing)
 * This prevents streaming issues where partial URLs would be loaded
 */
function renderTextWithLinks(text: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts = text.split(urlRegex)
  const elements: React.ReactNode[] = []
  
  parts.forEach((part, index) => {
    if (urlRegex.test(part)) {
      urlRegex.lastIndex = 0
      // Render all URLs as links - images come from schema fields
      elements.push(
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline break-all"
        >
          {part}
        </a>
      )
    } else if (part.trim()) {
      elements.push(<span key={index}>{part}</span>)
    }
  })
  
  return elements
}

/**
 * Get sentiment icon and color
 */
function getSentimentDisplay(sentiment: string) {
  switch (sentiment) {
    case 'bullish':
      return { icon: TrendingUp, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Bullish' }
    case 'bearish':
      return { icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Bearish' }
    case 'mixed':
      return { icon: Minus, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Gemischt' }
    default:
      return { icon: Minus, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Neutral' }
  }
}

/**
 * Get quote sentiment styling
 */
function getQuoteSentimentStyle(sentiment?: string) {
  switch (sentiment) {
    case 'bullish':
      return { border: 'border-l-green-500', bg: 'bg-green-500/5', icon: '📈' }
    case 'bearish':
      return { border: 'border-l-red-500', bg: 'bg-red-500/5', icon: '📉' }
    case 'humor':
      return { border: 'border-l-amber-500', bg: 'bg-amber-500/5', icon: '😄' }
    default:
      return { border: 'border-l-primary/50', bg: 'bg-muted/30', icon: '💬' }
  }
}

/**
 * URL Type Detection (matching chat implementation)
 */
function isTradingViewS3Image(url: string): boolean {
  return url.includes('s3.tradingview.com/snapshots/') && 
    (url.endsWith('.png') || url.endsWith('.jpg') || url.endsWith('.jpeg'))
}

function isTradingViewSnapshot(url: string): boolean {
  return url.includes('tradingview.com/x/') && url.includes('/')
}

function isTradingViewIdea(url: string): boolean {
  return url.includes('tradingview.com/chart/') && url.includes('/')
}

/**
 * Check if URL is complete and valid for loading
 * This prevents loading partial URLs during AI streaming
 */
function isCompleteImageUrl(url: string | undefined): boolean {
  if (!url || url.length < 20) return false
  
  // Must end with image extension
  const hasImageExtension = /\.(png|jpg|jpeg|webp|gif)$/i.test(url)
  if (hasImageExtension) return true
  
  // Or be a complete TradingView snapshot/idea URL (we'll convert it)
  // tradingview.com/x/ABC123/ - ID must be at least 6 chars
  const snapshotMatch = url.match(/tradingview\.com\/x\/([A-Za-z0-9]+)\/?$/)
  if (snapshotMatch && snapshotMatch[1].length >= 6) return true
  
  // tradingview.com/chart/SYMBOL/ABC123/ - ID must be at least 6 chars
  const ideaMatch = url.match(/tradingview\.com\/chart\/[^/]+\/([A-Za-z0-9]+)\/?$/)
  if (ideaMatch && ideaMatch[1].length >= 6) return true
  
  return false
}

/**
 * Get the URL type for display
 */
function getUrlType(url: string): { type: string; badge: string; color: string } {
  if (isTradingViewS3Image(url)) {
    return { type: 's3', badge: '📸 Snapshot', color: 'bg-green-600' }
  }
  if (isTradingViewSnapshot(url)) {
    return { type: 'snapshot', badge: '📊 Chart', color: 'bg-blue-600' }
  }
  if (isTradingViewIdea(url)) {
    return { type: 'idea', badge: '💡 Idea', color: 'bg-purple-600' }
  }
  return { type: 'other', badge: '🖼️ Bild', color: 'bg-gray-600' }
}

/**
 * Generate proxy URL for chart images (matching chat logic)
 */
function getChartProxyUrl(url: string | undefined): string {
  // Handle undefined or empty URL
  if (!url) return ''
  
  // Type 1: Direct S3 Image (best - already the final URL)
  if (isTradingViewS3Image(url)) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`
  }
  
  // Type 2: Snapshot URL (tradingview.com/x/ABC123)
  if (isTradingViewSnapshot(url)) {
    const match = url.match(/\/x\/([^/]+)\/?/)
    if (match) {
      const snapshotId = match[1]
      const firstLetter = snapshotId.charAt(0).toLowerCase()
      // Same format as chat: s3.tradingview.com/snapshots/{letter}/{id}.png
      const s3Url = `https://s3.tradingview.com/snapshots/${firstLetter}/${snapshotId}.png`
      return `/api/image-proxy?url=${encodeURIComponent(s3Url)}`
    }
  }
  
  // Type 3: Idea URL (tradingview.com/chart/SYMBOL/chartId)
  if (isTradingViewIdea(url)) {
    const match = url.match(/\/chart\/[^/]+\/([^/]+)\/?/)
    if (match) {
      const chartId = match[1]
      const firstLetter = chartId.charAt(0).toLowerCase()
      // Same format as chat: s3.tradingview.com/{letter}/{chartId}_mid.webp
      const s3Url = `https://s3.tradingview.com/${firstLetter}/${chartId}_mid.webp`
      return `/api/image-proxy?url=${encodeURIComponent(s3Url)}`
    }
  }
  
  // Fallback: Direct proxy
  return `/api/image-proxy?url=${encodeURIComponent(url)}`
}

/**
 * Chart Image Component - renders a chart with caption and visible error state
 * Supports floating layout for text wrapping (newspaper style)
 * Memoized to prevent re-renders during streaming
 */
const ChartImageDisplay = React.memo(function ChartImageDisplay({ 
  chart, 
  size = 'large',
  float = 'none',
  className = ''
}: { 
  chart: ChartImage
  size?: 'small' | 'medium' | 'large'
  float?: 'left' | 'right' | 'none'
  className?: string 
}) {
  const [imageStatus, setImageStatus] = React.useState<'loading' | 'loaded' | 'error'>('loading')
  
  // Memoize computations - must be called before any early returns
  const proxyUrl = React.useMemo(() => chart?.url ? getChartProxyUrl(chart.url) : '', [chart?.url])
  const urlInfo = React.useMemo(() => chart?.url ? getUrlType(chart.url) : { type: 'other', badge: '', color: '' }, [chart?.url])
  const isComplete = chart?.url ? isCompleteImageUrl(chart.url) : false
  
  // Don't render if chart or URL is missing
  if (!chart?.url) return null
  
  // Float classes for newspaper-style text wrapping (used in placeholder too)
  const floatClassesPlaceholder = {
    left: 'float-left mr-6 mb-4',
    right: 'float-right ml-6 mb-4',
    none: ''
  }
  
  // IMPORTANT: Don't render partial URLs during streaming!
  // This prevents 403 errors from incomplete URLs like "https://s3.tradingview.com/snap"
  if (!isComplete) {
    // Show a "waiting for URL" state instead of trying to load
    return (
      <div className={`${size === 'large' ? 'max-w-2xl' : size === 'medium' ? 'max-w-md' : 'max-w-xs'} ${floatClassesPlaceholder[float]} ${className}`}>
        <div className="h-32 w-full bg-muted/30 rounded-lg border border-dashed border-muted-foreground/30 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>URL wird geladen...</span>
          </div>
        </div>
      </div>
    )
  }
  
  if (!proxyUrl) return null
  
  const sizeClasses = {
    small: 'max-w-xs',
    medium: 'max-w-md',
    large: 'max-w-2xl'
  }
  
  const heightClasses = {
    small: 'h-32',
    medium: 'h-48',
    large: 'h-64'
  }
  
  // Float classes for newspaper-style text wrapping
  const floatClasses = {
    left: 'float-left mr-6 mb-4',
    right: 'float-right ml-6 mb-4',
    none: ''
  }
  
  return (
    <figure className={`${sizeClasses[size]} ${floatClasses[float]} ${className}`}>
      <div className="relative group">
        {/* Loading State */}
        {imageStatus === 'loading' && (
          <div className={`${heightClasses[size]} w-full bg-muted/50 rounded-lg border flex items-center justify-center`}>
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-xs">Chart wird geladen...</span>
            </div>
          </div>
        )}
        
        {/* Error State - VISIBLE! */}
        {imageStatus === 'error' && (
          <div className={`${heightClasses[size]} w-full bg-destructive/10 border-2 border-dashed border-destructive/30 rounded-lg flex items-center justify-center`}>
            <div className="flex flex-col items-center gap-3 text-center p-4">
              <ImageOff className="h-8 w-8 text-destructive/60" />
              <div>
                <p className="text-sm font-medium text-destructive">Chart konnte nicht geladen werden</p>
                <p className="text-xs text-muted-foreground mt-1 break-all max-w-xs">
                  {chart.url.length > 50 ? chart.url.substring(0, 50) + '...' : chart.url}
                </p>
              </div>
              <a
                href={chart.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Original öffnen
              </a>
            </div>
          </div>
        )}
        
        {/* Image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={proxyUrl}
          alt={chart.caption}
          className={`rounded-lg border shadow-sm w-full h-auto cursor-pointer hover:shadow-lg transition-shadow ${
            imageStatus !== 'loaded' ? 'hidden' : ''
          }`}
          onClick={() => window.open(chart.url, '_blank')}
          onLoad={() => setImageStatus('loaded')}
          onError={() => {
            console.error('❌ Image failed to load:', chart.url, '→', proxyUrl)
            setImageStatus('error')
          }}
        />
        
        {/* Badge overlay */}
        {imageStatus === 'loaded' && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Badge variant="secondary" className={`text-xs ${urlInfo.color} text-white`}>
              {urlInfo.badge}
            </Badge>
          </div>
        )}
      </div>
      
      <figcaption className="mt-2 text-sm text-muted-foreground">
        <span>{chart.caption}</span>
        {chart.author && (
          <span className="ml-2 text-xs">— @{chart.author}</span>
        )}
      </figcaption>
    </figure>
  )
})

/**
 * Styled Quote Component - renders a quote with sentiment styling
 */
const StyledQuoteDisplay = React.memo(function StyledQuoteDisplay({ 
  quote, 
  size = 'normal',
  className = ''
}: { 
  quote: StyledQuote
  size?: 'featured' | 'normal'
  className?: string 
}) {
  // Don't render if quote is missing essential data
  if (!quote?.text || !quote?.from) return null
  
  const style = getQuoteSentimentStyle(quote.sentiment)
  
  if (size === 'featured') {
    return (
      <blockquote className={`my-8 p-6 rounded-lg border-l-4 ${style.border} ${style.bg} ${className}`}>
        <div className="flex items-start gap-3">
          <Quote className="h-8 w-8 text-muted-foreground/30 flex-shrink-0 mt-1" />
          <div>
            <p className="text-xl font-body italic leading-relaxed">
              „{quote.text}"
            </p>
            <footer className="mt-4 flex items-center gap-2">
              <cite className="font-semibold not-italic">— @{quote.from}</cite>
              {quote.context && (
                <span className="text-sm text-muted-foreground">({quote.context})</span>
              )}
              {quote.sentiment && (
                <span className="text-lg">{style.icon}</span>
              )}
            </footer>
          </div>
        </div>
      </blockquote>
    )
  }
  
  return (
    <blockquote className={`mt-4 pl-4 border-l-4 ${style.border} ${style.bg} py-3 pr-4 rounded-r ${className}`}>
      <p className="text-muted-foreground italic">
        „{quote.text}"
      </p>
      <footer className="mt-2 flex items-center gap-2 text-sm">
        <cite className="font-semibold not-italic">— @{quote.from}</cite>
        {quote.context && (
          <span className="text-xs text-muted-foreground">({quote.context})</span>
        )}
        {quote.sentiment && (
          <span>{style.icon}</span>
        )}
      </footer>
    </blockquote>
  )
})

/**
 * Chart Gallery Component - renders multiple charts in a grid
 */
const ChartGallery = React.memo(function ChartGallery({ charts, className = '' }: { charts: ChartImage[]; className?: string }) {
  // Filter out charts without valid, complete URLs
  const validCharts = charts?.filter(c => c?.url && isCompleteImageUrl(c.url)) || []
  if (validCharts.length === 0) return null
  
  return (
    <div className={`mt-10 pt-6 border-t border-foreground/10 ${className}`}>
      <h4 className="text-sm font-headline uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
        <ImageIcon className="h-4 w-4" />
        Charts aus der Diskussion
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {validCharts.map((chart, idx) => (
          <ChartImageDisplay 
            key={idx} 
            chart={chart} 
            size="medium"
          />
        ))}
      </div>
    </div>
  )
})


/**
 * Skeleton component for loading states
 */
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-muted/50 rounded ${className}`} />
}

/**
 * Article skeleton shown while waiting for AI streaming to start
 */
function ArticleSkeleton() {
  return (
    <div className="space-y-8">
      {/* Title skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-10 sm:h-12 w-full" />
        <Skeleton className="h-10 sm:h-12 w-3/4" />
      </div>
      
      {/* Subtitle skeleton */}
      <Skeleton className="h-7 w-full" />
      
      {/* Sentiment bar skeleton */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-muted/30 border border-foreground/10 rounded-lg">
        <Skeleton className="h-8 w-24 rounded" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-14 rounded-full" />
        </div>
      </div>
      
      {/* Introduction skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-4/5" />
      </div>
      
      {/* Featured quote skeleton */}
      <div className="p-6 rounded-lg border-l-4 border-primary/30 bg-muted/20">
        <div className="space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-32 mt-4" />
        </div>
      </div>
      
      {/* Section skeletons */}
      {[0, 1, 2].map((idx) => (
        <div key={idx} className="border-l-2 border-foreground/20 pl-6 space-y-4">
          <Skeleton className="h-7 w-2/3" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
      
      {/* Key takeaways skeleton */}
      <div className="p-6 bg-primary/5 border border-primary/20 rounded-lg space-y-3">
        <Skeleton className="h-6 w-40" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    </div>
  )
}

/**
 * Category badge styling
 */
function getCategoryStyle(category: string): string {
  const styles: Record<string, string> = {
    'DISKUSSION': 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400',
    'ANALYSE': 'bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400',
    'MEINUNG': 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400',
    'HIGHLIGHT': 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400',
    'COMMUNITY': 'bg-pink-500/10 border-pink-500/30 text-pink-600 dark:text-pink-400',
  }
  return styles[category?.toUpperCase()] || 'bg-muted border-muted-foreground/20 text-muted-foreground'
}

function ArticleContent({ params }: { params: Promise<{ slug: string }> }) {
  // Resolve params (slug is available but we primarily use searchParams)
  use(params)
  const searchParams = useSearchParams()
  
  // Extract article data from URL params - memoize to prevent re-renders
  const articleType = searchParams.get('type') || 'featured'
  const headline = searchParams.get('headline') || ''
  const summary = searchParams.get('summary') || ''
  const category = searchParams.get('category') || ''
  const author = searchParams.get('author') || ''
  const contributorsParam = searchParams.get('contributors') || ''
  const quoteParam = searchParams.get('quote') || ''
  const selectedDate = searchParams.get('date') || new Date().toISOString().split('T')[0]
  const dayRange = parseInt(searchParams.get('dayRange') || '1', 10)
  
  // Parse these once and memoize
  const contributors = contributorsParam ? contributorsParam.split(',').filter(Boolean) : []
  const quote = quoteParam ? JSON.parse(decodeURIComponent(quoteParam)) : null
  
  // AI streaming state
  const { 
    object: articleData, 
    submit, 
    isLoading,
    error
  } = useObject({
    api: '/newspaper/api/expand-article',
    schema: ExpandedArticleSchema,
  })
  
  const data = articleData as Partial<ExpandedArticleData> | undefined
  
  // Use ref to ensure we only submit once
  const hasSubmittedRef = useRef(false)
  
  useEffect(() => {
    if (!hasSubmittedRef.current && headline && summary) {
      hasSubmittedRef.current = true
      submit({
        articleType,
        headline,
        summary,
        category,
        author,
        contributors: contributorsParam ? contributorsParam.split(',').filter(Boolean) : [],
        quote: quoteParam ? JSON.parse(decodeURIComponent(quoteParam)) : null,
        selectedDate,
        dayRange
      })
    }
  }, []) // Empty deps - run only once on mount
  
  // Regenerate handler
  const handleRegenerate = () => {
    submit({
      articleType,
      headline,
      summary,
      category,
      author,
      contributors,
      quote,
      selectedDate,
      dayRange
    })
  }
  
  // Format date for display
  const displayDate = new Date(selectedDate).toLocaleDateString('de-DE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return (
    <main className="min-h-screen bg-background">
      {/* Top Bar */}
      <div className="w-full border-b border-foreground/10 py-2">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex justify-between items-center text-xs text-muted-foreground">
          <Link 
            href="/newspaper" 
            className="flex items-center gap-2 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            <span>Zurück zur Übersicht</span>
          </Link>
          <div className="flex items-center gap-4">
            {isLoading && (
              <span className="flex items-center gap-1.5 text-amber-600">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span className="hidden sm:inline">Generiere Artikel...</span>
              </span>
            )}
            <ThemeSwitcher />
          </div>
        </div>
      </div>

      {/* Masthead */}
      <header className="w-full py-4 border-b-2 border-foreground/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <Link href="/newspaper" className="inline-block">
            <h1 className="font-masthead text-2xl sm:text-3xl md:text-4xl tracking-wide text-foreground hover:text-primary transition-colors">
              Financial Retarded Times
            </h1>
          </Link>
        </div>
      </header>

      {/* Article Content */}
      <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Meta Info */}
        <div className="flex flex-wrap items-center gap-3 mb-6 text-sm">
          <span className={`px-2 py-1 text-xs font-semibold rounded border ${getCategoryStyle(category)}`}>
            {category || 'ARTIKEL'}
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {displayDate}
          </span>
          {author && (
            <span className="text-muted-foreground">
              von <span className="font-semibold text-foreground">@{author}</span>
            </span>
          )}
        </div>

        {/* Show skeleton when loading and no data yet */}
        {isLoading && !data?.title && (
          <ArticleSkeleton />
        )}

        {/* Title */}
        <h1 className="font-headline text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-4 min-h-[1.2em]">
          {data?.title}
        </h1>

        {/* Subtitle */}
        {(data?.subtitle || (!isLoading && data?.title)) && (
          <p className="text-xl sm:text-2xl text-muted-foreground font-body mb-8 min-h-[1.5em]">
            {data?.subtitle}
          </p>
        )}

        {/* Header Image - only show when URL is complete */}
        {data?.headerImage?.url && isCompleteImageUrl(data.headerImage.url) && (
          <div className="mb-8">
            <ChartImageDisplay 
              chart={data.headerImage} 
              size="large"
              className="mx-auto"
            />
          </div>
        )}

        {/* Sentiment & Users Bar */}
        {(data?.sentiment || data?.mentionedUsers) && (
          <div className="flex flex-wrap items-center gap-4 mb-8 p-4 bg-muted/30 border border-foreground/10 rounded-lg">
            {data?.sentiment && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded ${getSentimentDisplay(data.sentiment).bg}`}>
                {(() => {
                  const SentimentIcon = getSentimentDisplay(data.sentiment).icon
                  return <SentimentIcon className={`h-4 w-4 ${getSentimentDisplay(data.sentiment).color}`} />
                })()}
                <span className={`text-sm font-medium ${getSentimentDisplay(data.sentiment).color}`}>
                  {getSentimentDisplay(data.sentiment).label}
                </span>
              </div>
            )}
            {data?.mentionedUsers && data.mentionedUsers.length > 0 && (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-wrap gap-1.5">
                  {data.mentionedUsers.map((user, idx) => (
                    <span 
                      key={idx}
                      className="px-2 py-0.5 bg-background text-xs rounded border border-foreground/10"
                      title={user.role}
                    >
                      <ContributorAvatar username={user.username} size="xs" />
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Introduction */}
        {(data?.introduction || data?.title) && (
          <div className="prose prose-lg dark:prose-invert max-w-none mb-8">
            <div className="text-lg leading-relaxed font-body min-h-[3em]">
              {data?.introduction && renderTextWithLinks(data.introduction)}
            </div>
          </div>
        )}

        {/* Featured Quote */}
        {data?.featuredQuote?.text && data?.featuredQuote?.from && (
          <StyledQuoteDisplay quote={data.featuredQuote} size="featured" />
        )}

        {/* Main Sections */}
        {data?.sections && data.sections.length > 0 && (
          <div className="space-y-10">
            {data.sections.map((section, idx) => (
              <section key={idx} className="border-l-2 border-foreground/20 pl-6 overflow-hidden">
                <h2 className="font-headline text-xl sm:text-2xl font-bold mb-4">
                  {section.heading}
                </h2>
                
                {/* Newspaper-style layout: Image floats, text wraps around */}
                <div className="prose dark:prose-invert max-w-none">
                  {/* Inline Image - alternates left/right for visual interest */}
                  {section.inlineImage?.url && isCompleteImageUrl(section.inlineImage.url) && (
                    <ChartImageDisplay 
                      chart={section.inlineImage} 
                      size="small"
                      float={idx % 2 === 0 ? 'right' : 'left'}
                    />
                  )}
                  
                  <div className="font-body leading-relaxed whitespace-pre-line">
                    {section.content && renderTextWithLinks(section.content)}
                  </div>
                </div>
                
                {/* Clear float before quote */}
                <div className="clear-both" />
                
                {/* Section Quote with sentiment styling */}
                {section.quote?.text && section.quote?.from && (
                  <StyledQuoteDisplay quote={section.quote} size="normal" />
                )}
              </section>
            ))}
          </div>
        )}

        {/* Key Takeaways */}
        {(data?.keyTakeaways && data.keyTakeaways.length > 0) && (
          <div className="mt-12 p-6 bg-primary/5 border border-primary/20 rounded-lg">
            <h3 className="font-headline text-lg font-bold mb-4 flex items-center gap-2">
              <span className="text-primary">📌</span> Key Takeaways
            </h3>
            <ul className="space-y-2">
              {data.keyTakeaways.map((takeaway, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <span className="text-primary font-bold">•</span>
                  <span className="font-body">{takeaway}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Conclusion */}
        {data?.conclusion && (
          <div className="mt-10 pt-8 border-t border-foreground/20">
            <h3 className="font-headline text-lg font-bold mb-4">Fazit</h3>
            <div className="font-body text-lg leading-relaxed">
              {renderTextWithLinks(data.conclusion)}
            </div>
          </div>
        )}

        {/* Chart Gallery - only show when we have complete URLs */}
        {data?.chartGallery && data.chartGallery.filter(c => c?.url && isCompleteImageUrl(c.url)).length > 0 && (
          <ChartGallery charts={data.chartGallery} />
        )}

        {/* Related Topics */}
        {data?.relatedTopics && data.relatedTopics.length > 0 && (
          <div className="mt-10 pt-6 border-t border-foreground/10">
            <h4 className="text-sm font-headline uppercase tracking-wider text-muted-foreground mb-3">
              Verwandte Themen
            </h4>
            <div className="flex flex-wrap gap-2">
              {data.relatedTopics.map((topic, idx) => (
                <span 
                  key={idx}
                  className="px-3 py-1.5 bg-muted text-sm font-body rounded-full"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="mt-8 p-4 bg-destructive/10 border border-destructive/30 rounded text-sm text-destructive">
            <p>Fehler beim Generieren des Artikels: {error.message}</p>
            <button 
              onClick={handleRegenerate}
              className="mt-2 px-4 py-2 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 transition-colors"
            >
              Erneut versuchen
            </button>
          </div>
        )}

        {/* Regenerate Button */}
        {!isLoading && data && (
          <div className="mt-10 pt-6 border-t border-foreground/10 flex justify-center">
            <button
              onClick={handleRegenerate}
              className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-foreground/20 rounded hover:border-foreground/40 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Artikel neu generieren
            </button>
          </div>
        )}

        {/* Contributors */}
        {contributors.length > 0 && (
          <div className="mt-10 pt-6 border-t border-foreground/10 text-sm text-muted-foreground">
            <span className="mr-2">Beteiligte:</span>
            <span className="inline-flex flex-wrap gap-2">
              {contributors.map((c, idx) => (
                <span key={idx} className="inline-flex items-center px-2 py-0.5 bg-muted rounded">
                  <ContributorAvatar username={c} size="sm" />
                </span>
              ))}
            </span>
          </div>
        )}

        {/* Debug: Show what URLs the AI provided */}
        {process.env.NODE_ENV === 'development' && data && (
          <details className="mt-10 pt-6 border-t border-foreground/10">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              🔧 Debug: AI-provided Image URLs
            </summary>
            <div className="mt-4 p-4 bg-muted/30 rounded text-xs font-mono space-y-2">
              <div>
                <strong>headerImage:</strong>{' '}
                {data.headerImage?.url ? (
                  <span className="text-green-600">{data.headerImage.url}</span>
                ) : (
                  <span className="text-muted-foreground">none</span>
                )}
              </div>
              {data.sections?.map((section, idx) => (
                <div key={idx}>
                  <strong>sections[{idx}].inlineImage:</strong>{' '}
                  {section.inlineImage?.url ? (
                    <span className="text-green-600">{section.inlineImage.url}</span>
                  ) : (
                    <span className="text-muted-foreground">none</span>
                  )}
                </div>
              ))}
              <div>
                <strong>chartGallery:</strong>{' '}
                {data.chartGallery && data.chartGallery.length > 0 ? (
                  <span className="text-green-600">
                    {data.chartGallery.map(c => c.url).join(', ')}
                  </span>
                ) : (
                  <span className="text-muted-foreground">none</span>
                )}
              </div>
            </div>
          </details>
        )}
      </article>

      {/* Footer */}
      <footer className="w-full border-t border-foreground/10 mt-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 text-center text-xs text-muted-foreground">
          <p>© 2025 Financial Retarded Times • „Keine Finanzberatung – nur Entertainment"</p>
        </div>
      </footer>
    </main>
  )
}

/**
 * Loading fallback for Suspense
 */
function ArticleLoading() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Artikel wird geladen...</p>
      </div>
    </main>
  )
}

/**
 * Main page component with Suspense boundary
 */
export default function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<ArticleLoading />}>
      <ArticleContent params={params} />
    </Suspense>
  )
}

