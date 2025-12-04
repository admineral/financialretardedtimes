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

import { useEffect, useState, use, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { z } from 'zod'
import { ArrowLeft, Clock, Users, TrendingUp, TrendingDown, Minus, RefreshCw, Loader2 } from 'lucide-react'
import { ThemeSwitcher } from '@/components/theme-switcher'

/**
 * Schema for expanded article (must match API)
 */
const ExpandedArticleSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  introduction: z.string(),
  sections: z.array(z.object({
    heading: z.string(),
    content: z.string(),
    quote: z.object({
      text: z.string(),
      from: z.string()
    }).optional()
  })),
  keyTakeaways: z.array(z.string()),
  conclusion: z.string(),
  relatedTopics: z.array(z.string()),
  sentiment: z.enum(['bullish', 'bearish', 'neutral', 'mixed']),
  mentionedUsers: z.array(z.object({
    username: z.string(),
    role: z.string()
  }))
})

type ExpandedArticleData = z.infer<typeof ExpandedArticleSchema>

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
 * Skeleton for loading state - uses span to be valid inside p tags
 */
function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`inline-block animate-pulse bg-muted/60 rounded ${className}`} />
}

/**
 * Streaming cursor
 */
function StreamingCursor({ show }: { show: boolean }) {
  if (!show) return null
  return <span className="inline-block w-0.5 h-[1em] bg-primary/70 animate-pulse ml-0.5 align-middle" />
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
  const resolvedParams = use(params)
  const searchParams = useSearchParams()
  
  // Extract article data from URL params
  const articleType = searchParams.get('type') || 'featured'
  const headline = searchParams.get('headline') || ''
  const summary = searchParams.get('summary') || ''
  const category = searchParams.get('category') || ''
  const author = searchParams.get('author') || ''
  const contributors = searchParams.get('contributors')?.split(',').filter(Boolean) || []
  const quoteParam = searchParams.get('quote')
  const quote = quoteParam ? JSON.parse(decodeURIComponent(quoteParam)) : null
  const selectedDate = searchParams.get('date') || new Date().toISOString().split('T')[0]
  const dayRange = parseInt(searchParams.get('dayRange') || '1', 10)
  
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
  
  // Trigger article expansion on mount
  const [hasSubmitted, setHasSubmitted] = useState(false)
  
  useEffect(() => {
    if (!hasSubmitted && headline && summary) {
      setHasSubmitted(true)
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
  }, [hasSubmitted, headline, summary, articleType, category, author, contributors, quote, selectedDate, dayRange, submit])
  
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

        {/* Title */}
        <h1 className="font-headline text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-4">
          {data?.title || headline || <Skeleton className="h-12 w-full" />}
          <StreamingCursor show={isLoading && !data?.subtitle} />
        </h1>

        {/* Subtitle */}
        <p className="text-xl sm:text-2xl text-muted-foreground font-body mb-8">
          {data?.subtitle || <Skeleton className="h-8 w-3/4" />}
          <StreamingCursor show={isLoading && !!data?.subtitle && !data?.introduction} />
        </p>

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
                      @{user.username}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Introduction */}
        <div className="prose prose-lg dark:prose-invert max-w-none mb-8">
          <p className="text-lg leading-relaxed font-body">
            {data?.introduction || (
              <>
                <Skeleton className="h-5 w-full mb-2" />
                <Skeleton className="h-5 w-full mb-2" />
                <Skeleton className="h-5 w-2/3" />
              </>
            )}
            <StreamingCursor show={isLoading && !!data?.introduction && (!data?.sections || data.sections.length === 0)} />
          </p>
        </div>

        {/* Main Sections */}
        <div className="space-y-10">
          {data?.sections && data.sections.length > 0 ? (
            data.sections.map((section, idx) => (
              <section key={idx} className="border-l-2 border-foreground/20 pl-6">
                <h2 className="font-headline text-xl sm:text-2xl font-bold mb-4">
                  {section.heading}
                </h2>
                <div className="prose dark:prose-invert max-w-none">
                  <p className="font-body leading-relaxed whitespace-pre-line">
                    {section.content}
                  </p>
                </div>
                {section.quote && (
                  <blockquote className="mt-4 pl-4 border-l-2 border-primary/50 italic">
                    <p className="text-muted-foreground">
                      „{section.quote.text}"
                    </p>
                    <cite className="text-sm font-semibold not-italic">
                      — @{section.quote.from}
                    </cite>
                  </blockquote>
                )}
              </section>
            ))
          ) : isLoading ? (
            <>
              {[0, 1].map((idx) => (
                <section key={idx} className="border-l-2 border-foreground/20 pl-6">
                  <Skeleton className="h-7 w-1/3 mb-4" />
                  <Skeleton className="h-5 w-full mb-2" />
                  <Skeleton className="h-5 w-full mb-2" />
                  <Skeleton className="h-5 w-full mb-2" />
                  <Skeleton className="h-5 w-3/4" />
                </section>
              ))}
            </>
          ) : null}
        </div>

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
            <p className="font-body text-lg leading-relaxed">
              {data.conclusion}
            </p>
          </div>
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
            <span>Beteiligte: </span>
            {contributors.map((c, idx) => (
              <span key={idx}>
                <span className="font-semibold">@{c}</span>
                {idx < contributors.length - 1 ? ', ' : ''}
              </span>
            ))}
          </div>
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

