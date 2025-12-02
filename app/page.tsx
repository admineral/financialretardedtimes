'use client'

import { useEffect, useState, useRef, memo } from 'react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { ThemeSwitcher } from "@/components/theme-switcher"
import { GuestbookChat } from "@/components/guestbook-chat"
import Link from "next/link"
import { RefreshCwIcon, SparklesIcon } from 'lucide-react'
import { z } from 'zod'

// Memoized Chat Section to prevent re-renders during AI streaming
const ChatSection = memo(function ChatSection() {
  return (
    <div className="border-2 border-foreground/30 bg-card">
      <div className="px-4 py-3 border-b-2 border-foreground/30 bg-muted/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-headline text-sm font-bold uppercase tracking-wider">Live-Ticker</h3>
            <p className="text-[10px] text-muted-foreground font-body">Echtzeit Community Chat</p>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            LIVE
          </span>
        </div>
      </div>
      <GuestbookChat />
    </div>
  )
})

// Schema for AI-generated content
const LandingPageSchema = z.object({
  topTraders: z.array(z.object({
    username: z.string(),
    initial: z.string().max(1)
  })).length(3),
  
  trendingTopics: z.array(z.string()).min(4).max(6),
  
  communityHighlight: z.object({
    username: z.string(),
    contributionCount: z.number(),
    label: z.string()
  }),

  featuredArticle: z.object({
    author: z.string(),
    date: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    summary: z.string(),
    keyQuote: z.string(),
    contributors: z.array(z.string()).min(2).max(5)
  }),

  secondaryArticle: z.object({
    author: z.string(),
    date: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    summary: z.string(),
    contributors: z.array(z.string()).min(2).max(4)
  }),

  thirdArticle: z.object({
    author: z.string(),
    date: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    summary: z.string()
  }),

  fourthArticle: z.object({
    author: z.string(),
    date: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    summary: z.string()
  }),

  fifthArticle: z.object({
    author: z.string(),
    date: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    summary: z.string()
  }),

  moreArticles: z.array(z.object({
    category: z.string(),
    headline: z.string(),
    teaser: z.string(),
    fullText: z.string()
  })).length(4),

  shortNews: z.array(z.object({
    author: z.string(),
    date: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    headline: z.string(),
    teaser: z.string(),
    fullText: z.string(),
    topics: z.string()
  })).length(4),

  events: z.array(z.object({
    id: z.string(),
    type: z.enum(['conflict', 'milestone', 'drama', 'discovery', 'meme']),
    label: z.string(),
    summary: z.string(),
    timeRange: z.string(),
    category: z.enum(['konflikt', 'meilenstein', 'drama', 'entdeckung', 'meme']),
    participants: z.array(z.string()).min(2).max(6)
  })).min(1).max(3),

  highlights: z.array(z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    highlightLevel: z.enum(['low', 'medium', 'high']),
    sections: z.array(z.object({
      id: z.string(),
      title: z.string(),
      context: z.string(),
      quotes: z.array(z.object({
        from: z.string(),
        text: z.string()
      })).min(2).max(4),
      analysis: z.string()
    })).min(2).max(5),
    participants: z.array(z.string()).min(2).max(8),
    tags: z.array(z.string()).min(2).max(4)
  })).min(1).max(2)
})

type LandingPageData = z.infer<typeof LandingPageSchema>

// Skeleton component
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-muted rounded ${className}`} />
}

// Expandable text component
function ExpandableText({ 
  teaser, 
  fullText,
  className = ''
}: { 
  teaser: string | undefined
  fullText: string | undefined
  className?: string
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  if (!teaser) return <Skeleton className="h-4 w-3/4" />
  
  const hasMore = fullText && fullText.length > teaser.length
  
  return (
    <div className={className}>
      <p className="text-xs sm:text-sm text-muted-foreground font-body">
        {isExpanded && fullText ? fullText : teaser}
      </p>
      {hasMore && (
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-[10px] text-primary hover:underline mt-1 font-headline uppercase tracking-wider"
        >
          {isExpanded ? '← Weniger' : 'Mehr lesen →'}
        </button>
      )}
    </div>
  )
}

// Text or Skeleton - shows skeleton if no text, otherwise shows text
function TextOrSkeleton({ 
  text, 
  skeletonClass = 'h-4 w-32',
  className = '',
  as: Component = 'span'
}: { 
  text: string | undefined | null
  skeletonClass?: string
  className?: string
  as?: 'span' | 'p' | 'h3' | 'h4' | 'div'
}) {
  if (!text) {
    return <Skeleton className={skeletonClass} />
  }
  return <Component className={className}>{text}</Component>
}

function CurrentDate() {
  const [date, setDate] = useState<string>('')
  
  useEffect(() => {
    const now = new Date()
    setDate(now.toLocaleDateString('de-DE', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }))
  }, [])
  
  return <span>{date || 'Loading...'}</span>
}

export default function Home() {
  const hasGeneratedRef = useRef(false)
  
  const { 
    object: aiData, 
    submit: generateContent, 
    isLoading,
    error
  } = useObject({
    api: '/Test/admin/api/summarize-v5',
    schema: LandingPageSchema,
  })

  // Auto-generate on mount - use ref to prevent double-call in Strict Mode
  useEffect(() => {
    if (!hasGeneratedRef.current) {
      hasGeneratedRef.current = true
      generateContent({ messageLimit: 500 })
    }
  }, [])

  // Direct access to AI data - no fallbacks
  const data = aiData as Partial<LandingPageData> | undefined

  const getCategoryStyle = (category: string | undefined) => {
    if (!category) return 'bg-muted text-muted-foreground'
    const styles: Record<string, string> = {
      'ANALYSE': 'bg-primary/10 text-primary border-primary/30',
      'MEINUNG': 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30',
      'KULTUR': 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
      'MARKTSTRUKTUR': 'bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30',
      'ALTCOINS': 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border-cyan-500/30',
      'BREAKING': 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30',
    }
    return styles[category] || 'bg-muted text-muted-foreground'
  }

  const getEventStyle = (type: string | undefined) => {
    if (!type) return 'bg-muted text-muted-foreground'
    const styles: Record<string, string> = {
      'conflict': 'bg-red-500/20 text-red-700 dark:text-red-400',
      'milestone': 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
      'drama': 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
      'discovery': 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
      'meme': 'bg-pink-500/20 text-pink-700 dark:text-pink-400',
    }
    return styles[type] || 'bg-muted text-muted-foreground'
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Top Bar */}
      <div className="w-full border-b border-foreground/10 py-2">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 flex justify-between items-center text-xs text-muted-foreground">
          <CurrentDate />
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline">Vol. 1 • No. 1</span>
            {isLoading && (
              <span className="flex items-center gap-1.5 text-amber-600">
                <SparklesIcon className="h-3 w-3 animate-pulse" />
                <span className="hidden sm:inline">AI generating...</span>
              </span>
            )}
            <ThemeSwitcher />
          </div>
        </div>
      </div>

      {/* Masthead */}
      <header className="w-full py-4 sm:py-6 border-b-4 border-double border-foreground/60">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 text-center">
          <Link href="/" className="inline-block">
            <h1 className="font-masthead text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl tracking-wide text-foreground hover:text-primary transition-colors">
              Financial Retarded Times
            </h1>
          </Link>
          <p className="font-headline text-[10px] sm:text-xs md:text-sm lg:text-base tracking-[0.2em] sm:tracking-[0.3em] uppercase text-muted-foreground mt-1 sm:mt-2">
            Tradingview Edition • Die Stimme des Krypto-Chats
          </p>
        </div>
      </header>

      {/* Navigation */}
      <nav className="w-full border-b border-foreground/20 py-2 sm:py-3 sticky top-0 z-50 bg-background/95 backdrop-blur-sm">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex gap-3 sm:gap-4 md:gap-6 font-headline text-xs sm:text-sm tracking-wide">
            <Link href="/Rate-Chart" className="hover:text-primary transition-colors font-semibold">Rate-Chart</Link>
            <Link href="/Test" className="hover:text-primary transition-colors">Chat</Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <input 
              type="text" 
              placeholder="Suchen..." 
              className="hidden lg:block px-3 py-1.5 text-sm border border-foreground/20 bg-transparent rounded-sm font-body focus:outline-none focus:border-primary/50 w-40"
            />
            <button 
              onClick={() => generateContent({ messageLimit: 500 })}
              disabled={isLoading}
              className="px-2 sm:px-4 py-1 sm:py-1.5 bg-primary text-primary-foreground text-xs sm:text-sm font-headline tracking-wide hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {isLoading ? (
                <><RefreshCwIcon className="h-3 w-3 animate-spin" /> <span className="hidden sm:inline">GENERATING</span></>
              ) : (
                <><SparklesIcon className="h-3 w-3" /> REFRESH</>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Error Banner */}
      {error && (
        <div className="w-full bg-destructive/10 border-b border-destructive/30 py-2 px-4 text-center text-xs text-destructive">
          AI generation failed: {error.message}
        </div>
      )}

      {/* Main Content Grid */}
      <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
          
          {/* Left Sidebar */}
          <aside className="lg:col-span-2 hidden lg:block">
            <div className="sticky top-20">
              <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground mb-4 pb-2 border-b border-foreground/20">
                Top Trader
              </h3>
              <ul className="space-y-3 font-body text-sm">
                {data?.topTraders && data.topTraders.length > 0 ? (
                  data.topTraders.map((trader, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                        {trader.initial || '?'}
                      </span>
                      {trader.username || <Skeleton className="h-4 w-24" />}
                    </li>
                  ))
                ) : (
                  <>
                    <li className="flex items-center gap-2"><Skeleton className="w-6 h-6 rounded-full" /><Skeleton className="h-4 w-28" /></li>
                    <li className="flex items-center gap-2"><Skeleton className="w-6 h-6 rounded-full" /><Skeleton className="h-4 w-24" /></li>
                    <li className="flex items-center gap-2"><Skeleton className="w-6 h-6 rounded-full" /><Skeleton className="h-4 w-20" /></li>
                  </>
                )}
              </ul>

              <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground mt-8 mb-4 pb-2 border-b border-foreground/20">
                Trending Themen
              </h3>
              <ul className="space-y-2 font-body text-sm">
                {data?.trendingTopics && data.trendingTopics.length > 0 ? (
                  data.trendingTopics.map((topic, idx) => (
                    <li key={idx} className="text-primary hover:underline cursor-pointer">
                      #{topic}
                    </li>
                  ))
                ) : (
                  <>
                    <li><Skeleton className="h-4 w-28" /></li>
                    <li><Skeleton className="h-4 w-24" /></li>
                    <li><Skeleton className="h-4 w-32" /></li>
                    <li><Skeleton className="h-4 w-20" /></li>
                  </>
                )}
              </ul>

              <div className="mt-8 pt-4 border-t border-foreground/20">
                <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground mb-3">
                  Community Highlights
                </h3>
                <p className="text-xs text-muted-foreground font-body leading-relaxed">
                  Top Beitragender diese Woche
                </p>
                {data?.communityHighlight?.username ? (
                  <>
                    <p className="font-headline font-semibold text-sm mt-1">{data.communityHighlight.username}</p>
                    <p className="text-xs text-muted-foreground">
                      {data.communityHighlight.contributionCount} {data.communityHighlight.label}
                    </p>
                  </>
                ) : (
                  <>
                    <Skeleton className="h-4 w-32 mt-1" />
                    <Skeleton className="h-3 w-24 mt-1" />
                  </>
                )}
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="lg:col-span-7">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-4 sm:mb-6 pb-2 border-b-2 border-foreground/60">
              <h2 className="font-headline text-xl sm:text-2xl font-bold">Titelseite</h2>
              <div className="flex gap-1 sm:gap-2 text-[10px] sm:text-xs font-headline">
                <button className="px-2 sm:px-3 py-1 border border-foreground/40 hover:bg-muted transition-colors">NEUESTE</button>
                <button className="px-2 sm:px-3 py-1 border border-foreground/20 hover:bg-muted transition-colors text-muted-foreground hidden sm:block">TRENDING</button>
                <button className="px-2 sm:px-3 py-1 border border-foreground/20 hover:bg-muted transition-colors text-muted-foreground hidden sm:block">VERIFIZIERT</button>
              </div>
            </div>

            {/* Featured Article */}
            <article className="mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-foreground/20">
              <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
                {data?.featuredArticle?.author ? (
                  <span className="text-[10px] sm:text-xs font-headline uppercase tracking-wider text-muted-foreground">
                    {data.featuredArticle.author}
                  </span>
                ) : (
                  <Skeleton className="h-3 w-20" />
                )}
                <span className="text-muted-foreground">•</span>
                {data?.featuredArticle?.date ? (
                  <span className="text-[10px] sm:text-xs text-muted-foreground">{data.featuredArticle.date}</span>
                ) : (
                  <Skeleton className="h-3 w-16" />
                )}
                {data?.featuredArticle?.category ? (
                  <span className={`ml-auto px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded border ${getCategoryStyle(data.featuredArticle.category)}`}>
                    {data.featuredArticle.category}
                  </span>
                ) : (
                  <Skeleton className="ml-auto h-5 w-16 rounded" />
                )}
              </div>
              {data?.featuredArticle?.headline ? (
                <h3 className="font-headline text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold leading-tight mb-3 sm:mb-4 hover:text-primary/80 cursor-pointer transition-colors">
                  {data.featuredArticle.headline}
                </h3>
              ) : (
                <div className="mb-3 sm:mb-4 space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-3/4" />
                </div>
              )}
              {data?.featuredArticle?.summary ? (
                <p className="font-body text-sm sm:text-base md:text-lg leading-relaxed text-muted-foreground mb-3 sm:mb-4">
                  {data.featuredArticle.summary}
                </p>
              ) : (
                <div className="mb-3 sm:mb-4 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              )}
              {data?.featuredArticle?.keyQuote ? (
                <blockquote className="border-l-4 border-foreground/30 pl-3 sm:pl-4 py-2 my-3 sm:my-4 italic font-body text-muted-foreground text-sm sm:text-base">
                  „{data.featuredArticle.keyQuote}"
                </blockquote>
              ) : (
                <div className="border-l-4 border-foreground/30 pl-3 sm:pl-4 py-2 my-3 sm:my-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4 mt-1" />
                </div>
              )}
              {data?.featuredArticle?.contributors && data.featuredArticle.contributors.length > 0 && (
                <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                  {data.featuredArticle.contributors.map((contributor, idx) => (
                    <span key={idx} className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted text-[10px] sm:text-xs font-body rounded">
                      @{contributor}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm">
                <Link href="/" className="text-primary font-headline hover:underline">Weiterlesen →</Link>
              </div>
            </article>

            {/* Secondary Article */}
            <article className="mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-foreground/20">
              <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
                {data?.secondaryArticle?.author ? (
                  <span className="text-[10px] sm:text-xs font-headline uppercase tracking-wider text-muted-foreground">
                    {data.secondaryArticle.author}
                  </span>
                ) : (
                  <Skeleton className="h-3 w-24" />
                )}
                <span className="text-muted-foreground">•</span>
                {data?.secondaryArticle?.date ? (
                  <span className="text-[10px] sm:text-xs text-muted-foreground">{data.secondaryArticle.date}</span>
                ) : (
                  <Skeleton className="h-3 w-16" />
                )}
                {data?.secondaryArticle?.category ? (
                  <span className={`ml-auto px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded border ${getCategoryStyle(data.secondaryArticle.category)}`}>
                    {data.secondaryArticle.category}
                  </span>
                ) : (
                  <Skeleton className="ml-auto h-5 w-16 rounded" />
                )}
              </div>
              {data?.secondaryArticle?.headline ? (
                <h3 className="font-headline text-lg sm:text-xl md:text-2xl font-bold leading-tight mb-2 sm:mb-3 hover:text-primary/80 cursor-pointer transition-colors">
                  {data.secondaryArticle.headline}
                </h3>
              ) : (
                <div className="mb-2 sm:mb-3 space-y-2">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-2/3" />
                </div>
              )}
              {data?.secondaryArticle?.summary ? (
                <p className="font-body text-sm sm:text-base leading-relaxed text-muted-foreground mb-3 sm:mb-4">
                  {data.secondaryArticle.summary}
                </p>
              ) : (
                <div className="mb-3 sm:mb-4 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              )}
              {data?.secondaryArticle?.contributors && data.secondaryArticle.contributors.length > 0 && (
                <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                  {data.secondaryArticle.contributors.map((contributor, idx) => (
                    <span key={idx} className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted text-[10px] sm:text-xs font-body rounded">
                      @{contributor}
                    </span>
                  ))}
                </div>
              )}
            </article>

            {/* Third Article */}
            <article className="mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-foreground/20">
              <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
                {data?.thirdArticle?.author ? (
                  <span className="text-[10px] sm:text-xs font-headline uppercase tracking-wider text-muted-foreground">
                    {data.thirdArticle.author}
                  </span>
                ) : (
                  <Skeleton className="h-3 w-20" />
                )}
                <span className="text-muted-foreground">•</span>
                {data?.thirdArticle?.date ? (
                  <span className="text-[10px] sm:text-xs text-muted-foreground">{data.thirdArticle.date}</span>
                ) : (
                  <Skeleton className="h-3 w-16" />
                )}
                {data?.thirdArticle?.category ? (
                  <span className={`ml-auto px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded border ${getCategoryStyle(data.thirdArticle.category)}`}>
                    {data.thirdArticle.category}
                  </span>
                ) : (
                  <Skeleton className="ml-auto h-5 w-16 rounded" />
                )}
              </div>
              {data?.thirdArticle?.headline ? (
                <h3 className="font-headline text-lg sm:text-xl md:text-2xl font-bold leading-tight mb-2 sm:mb-3 hover:text-primary/80 cursor-pointer transition-colors">
                  {data.thirdArticle.headline}
                </h3>
              ) : (
                <div className="mb-2 sm:mb-3 space-y-2">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-1/2" />
                </div>
              )}
              {data?.thirdArticle?.summary ? (
                <p className="font-body text-sm sm:text-base leading-relaxed text-muted-foreground">
                  {data.thirdArticle.summary}
                </p>
              ) : (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              )}
            </article>

            {/* Fourth & Fifth Articles - Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-foreground/20">
              {/* Fourth Article */}
              <article>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {data?.fourthArticle?.author ? (
                    <span className="text-[10px] sm:text-xs font-headline uppercase tracking-wider text-muted-foreground">
                      {data.fourthArticle.author}
                    </span>
                  ) : (
                    <Skeleton className="h-3 w-16" />
                  )}
                  <span className="text-muted-foreground">•</span>
                  {data?.fourthArticle?.date ? (
                    <span className="text-[10px] sm:text-xs text-muted-foreground">{data.fourthArticle.date}</span>
                  ) : (
                    <Skeleton className="h-3 w-14" />
                  )}
                </div>
                {data?.fourthArticle?.category && (
                  <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded border mb-2 ${getCategoryStyle(data.fourthArticle.category)}`}>
                    {data.fourthArticle.category}
                  </span>
                )}
                {data?.fourthArticle?.headline ? (
                  <h3 className="font-headline text-base sm:text-lg font-bold leading-tight mb-2 hover:text-primary/80 cursor-pointer transition-colors">
                    {data.fourthArticle.headline}
                  </h3>
                ) : (
                  <div className="mb-2 space-y-1">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-2/3" />
                  </div>
                )}
                {data?.fourthArticle?.summary ? (
                  <p className="font-body text-xs sm:text-sm leading-relaxed text-muted-foreground">
                    {data.fourthArticle.summary}
                  </p>
                ) : (
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                )}
              </article>

              {/* Fifth Article */}
              <article>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {data?.fifthArticle?.author ? (
                    <span className="text-[10px] sm:text-xs font-headline uppercase tracking-wider text-muted-foreground">
                      {data.fifthArticle.author}
                    </span>
                  ) : (
                    <Skeleton className="h-3 w-16" />
                  )}
                  <span className="text-muted-foreground">•</span>
                  {data?.fifthArticle?.date ? (
                    <span className="text-[10px] sm:text-xs text-muted-foreground">{data.fifthArticle.date}</span>
                  ) : (
                    <Skeleton className="h-3 w-14" />
                  )}
                </div>
                {data?.fifthArticle?.category && (
                  <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded border mb-2 ${getCategoryStyle(data.fifthArticle.category)}`}>
                    {data.fifthArticle.category}
                  </span>
                )}
                {data?.fifthArticle?.headline ? (
                  <h3 className="font-headline text-base sm:text-lg font-bold leading-tight mb-2 hover:text-primary/80 cursor-pointer transition-colors">
                    {data.fifthArticle.headline}
                  </h3>
                ) : (
                  <div className="mb-2 space-y-1">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-2/3" />
                  </div>
                )}
                {data?.fifthArticle?.summary ? (
                  <p className="font-body text-xs sm:text-sm leading-relaxed text-muted-foreground">
                    {data.fifthArticle.summary}
                  </p>
                ) : (
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                )}
              </article>
            </div>

            {/* More Articles Teaser */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {data?.moreArticles && data.moreArticles.length > 0 ? (
                data.moreArticles.map((article, idx) => (
                  <article key={idx} className="pb-3 sm:pb-4 border-b border-foreground/10">
                    {article.category ? (
                      <span className="text-[10px] sm:text-xs text-muted-foreground font-headline uppercase tracking-wider">
                        {article.category}
                      </span>
                    ) : (
                      <Skeleton className="h-3 w-16" />
                    )}
                    {article.headline ? (
                      <h4 className="font-headline text-sm sm:text-base font-semibold mt-1 hover:text-primary/80 cursor-pointer transition-colors">
                        {article.headline}
                      </h4>
                    ) : (
                      <Skeleton className="h-5 w-full mt-1" />
                    )}
                    <ExpandableText 
                      teaser={article.teaser} 
                      fullText={article.fullText}
                      className="mt-1"
                    />
                  </article>
                ))
              ) : (
                <>
                  {[1, 2, 3, 4].map((i) => (
                    <article key={i} className="pb-3 sm:pb-4 border-b border-foreground/10">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-5 w-full mt-1" />
                      <Skeleton className="h-4 w-3/4 mt-1" />
                    </article>
                  ))}
                </>
              )}
            </div>

            {/* Events Section */}
            <div className="mt-6 sm:mt-8">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-foreground/20">
                <h3 className="font-headline text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                  <span className="text-amber-500">⚡</span> Chat-Events
                </h3>
              </div>
              
              {data?.events && data.events.length > 0 ? (
                <div className="space-y-4">
                  {data.events.map((event, idx) => (
                    <div key={idx} className="p-3 sm:p-4 border border-foreground/20 bg-muted/20 rounded-sm">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${getEventStyle(event.type)}`}>
                          {event.category?.toUpperCase() || event.type?.toUpperCase()}
                        </span>
                        {event.timeRange && (
                          <span className="text-[10px] text-muted-foreground">
                            🕐 {event.timeRange}
                          </span>
                        )}
                      </div>
                      {event.label ? (
                        <h4 className="font-headline text-sm sm:text-base font-semibold mb-2">
                          {event.label}
                        </h4>
                      ) : (
                        <Skeleton className="h-5 w-full mb-2" />
                      )}
                      {event.summary ? (
                        <p className="text-xs sm:text-sm text-muted-foreground font-body mb-3">
                          {event.summary}
                        </p>
                      ) : (
                        <div className="space-y-1 mb-3">
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-3/4" />
                        </div>
                      )}
                      {event.participants && event.participants.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {event.participants.map((participant, pIdx) => (
                            <span key={pIdx} className="px-1.5 py-0.5 bg-background text-[10px] font-body rounded border border-foreground/10">
                              @{participant}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 sm:p-4 border border-foreground/20 bg-muted/20 rounded-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <Skeleton className="h-4 w-16 rounded" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-5 w-full mb-2" />
                    <Skeleton className="h-3 w-full mb-1" />
                    <Skeleton className="h-3 w-3/4 mb-3" />
                    <div className="flex gap-1.5">
                      <Skeleton className="h-4 w-16 rounded" />
                      <Skeleton className="h-4 w-20 rounded" />
                      <Skeleton className="h-4 w-14 rounded" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Highlights Section */}
            <div className="mt-6 sm:mt-8">
              <div className="flex items-center justify-between mb-4 pb-2 border-b-2 border-foreground/40">
                <h3 className="font-headline text-base sm:text-lg font-bold uppercase tracking-wider flex items-center gap-2">
                  <span className="text-rose-500">📰</span> Chat-Highlights
                </h3>
                <span className="text-[10px] text-muted-foreground font-headline uppercase tracking-wider">
                  Story-Format
                </span>
              </div>
              
              {data?.highlights && data.highlights.length > 0 ? (
                <div className="space-y-6">
                  {data.highlights.map((highlight, idx) => (
                    <div key={idx} className="border-2 border-foreground/20 bg-card">
                      {/* Highlight Header */}
                      <div className="p-4 border-b border-foreground/20 bg-muted/30">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {highlight.highlightLevel && (
                            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                              highlight.highlightLevel === 'high' ? 'bg-rose-500/20 text-rose-700 dark:text-rose-400' :
                              highlight.highlightLevel === 'medium' ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400' :
                              'bg-blue-500/20 text-blue-700 dark:text-blue-400'
                            }`}>
                              {highlight.highlightLevel === 'high' ? '🔥 HOT' : 
                               highlight.highlightLevel === 'medium' ? '⭐ FEATURED' : '📌 NOTABLE'}
                            </span>
                          )}
                          {highlight.tags?.map((tag, tIdx) => (
                            <span key={tIdx} className="px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                        {highlight.title ? (
                          <h4 className="font-headline text-lg sm:text-xl font-bold leading-tight">
                            {highlight.title}
                          </h4>
                        ) : (
                          <Skeleton className="h-6 w-full" />
                        )}
                        {highlight.summary && (
                          <p className="text-sm text-muted-foreground font-body mt-2">
                            {highlight.summary}
                          </p>
                        )}
                        {highlight.participants && highlight.participants.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {highlight.participants.map((p, pIdx) => (
                              <span key={pIdx} className="px-1.5 py-0.5 bg-background text-[10px] font-body rounded border border-foreground/10">
                                @{p}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* Sections */}
                      {highlight.sections && highlight.sections.length > 0 && (
                        <div className="divide-y divide-foreground/10">
                          {highlight.sections.map((section, sIdx) => (
                            <div key={sIdx} className="p-4">
                              {section.title && (
                                <h5 className="font-headline text-sm font-semibold mb-2 flex items-center gap-2">
                                  <span className="text-muted-foreground">{sIdx + 1}.</span>
                                  {section.title}
                                </h5>
                              )}
                              {section.context && (
                                <p className="text-xs text-muted-foreground font-body mb-3 italic">
                                  {section.context}
                                </p>
                              )}
                              {/* Quotes */}
                              {section.quotes && section.quotes.length > 0 && (
                                <div className="space-y-2 mb-3 pl-3 border-l-2 border-primary/30">
                                  {section.quotes.map((quote, qIdx) => (
                                    <div key={qIdx} className="text-sm">
                                      <span className="font-semibold text-primary">@{quote.from}:</span>
                                      <span className="text-foreground ml-1">„{quote.text}"</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {section.analysis && (
                                <p className="text-xs text-muted-foreground font-body bg-muted/50 p-2 rounded">
                                  💡 {section.analysis}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border-2 border-foreground/20 bg-card">
                  <div className="p-4 border-b border-foreground/20 bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Skeleton className="h-4 w-16 rounded" />
                      <Skeleton className="h-4 w-12 rounded" />
                    </div>
                    <Skeleton className="h-6 w-full mb-2" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                  <div className="p-4">
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-3 w-full mb-3" />
                    <div className="space-y-2 mb-3 pl-3 border-l-2 border-primary/30">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                    </div>
                    <Skeleton className="h-10 w-full rounded" />
                  </div>
                </div>
              )}
            </div>
          </main>

          {/* Right Sidebar - Chat */}
          <aside className="lg:col-span-3">
            <div className="sticky top-20">
              {/* Mini Articles Above Chat */}
              <div className="hidden lg:block mb-6">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-foreground/20">
                  <h3 className="font-headline text-sm font-bold uppercase tracking-wider">Kurzmeldungen</h3>
                </div>
                
                {data?.shortNews && data.shortNews.length > 0 ? (
                  data.shortNews.map((news, idx) => (
                    <article key={idx} className="mb-4 pb-4 border-b border-foreground/10">
                      <div className="flex items-center gap-2 mb-1">
                        {news.author ? (
                          <span className="text-xs text-muted-foreground">{news.author}</span>
                        ) : (
                          <Skeleton className="h-3 w-20" />
                        )}
                        <span className="text-muted-foreground text-xs">•</span>
                        {news.date ? (
                          <span className="text-xs text-muted-foreground">{news.date}</span>
                        ) : (
                          <Skeleton className="h-3 w-16" />
                        )}
                        {news.category ? (
                          <span className={`ml-auto px-1.5 py-0.5 text-[10px] font-semibold rounded ${getCategoryStyle(news.category)}`}>
                            {news.category}
                          </span>
                        ) : (
                          <Skeleton className="ml-auto h-4 w-14 rounded" />
                        )}
                      </div>
                      {news.headline ? (
                        <h4 className="font-headline text-sm font-semibold leading-snug hover:text-primary/80 cursor-pointer">
                          {news.headline}
                        </h4>
                      ) : (
                        <Skeleton className="h-4 w-full" />
                      )}
                      <ExpandableText 
                        teaser={news.teaser} 
                        fullText={news.fullText}
                        className="mt-1"
                      />
                      {news.topics && (
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] text-muted-foreground">{news.topics}</span>
                        </div>
                      )}
                    </article>
                  ))
                ) : (
                  <>
                    {[1, 2, 3, 4].map((i) => (
                      <article key={i} className="mb-4 pb-4 border-b border-foreground/10">
                        <div className="flex items-center gap-2 mb-1">
                          <Skeleton className="h-3 w-20" />
                          <span className="text-muted-foreground text-xs">•</span>
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="ml-auto h-4 w-14 rounded" />
                        </div>
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-full mt-1" />
                        <Skeleton className="h-3 w-3/4 mt-1" />
                      </article>
                    ))}
                  </>
                )}
              </div>

              {/* Chat Section */}
              <ChatSection />

              {/* Newsletter */}
              <div className="mt-6 p-4 border-2 border-foreground/20 bg-muted/30">
                <h4 className="font-headline text-sm font-bold uppercase tracking-wider mb-2">Newsletter</h4>
                <p className="text-xs text-muted-foreground font-body mb-3">
                  Die wichtigsten Chat-Highlights direkt in Ihr Postfach.
                </p>
                <div className="flex gap-2">
                  <input 
                    type="email" 
                    placeholder="E-Mail Adresse" 
                    className="flex-1 px-3 py-1.5 text-xs font-body bg-background border border-foreground/20 focus:outline-none focus:border-primary/50"
                  />
                  <button className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-headline tracking-wide hover:bg-primary/90 transition-colors">
                    OK
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full border-t-2 border-foreground/20 mt-8 sm:mt-12">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6">
          {/* Links Row */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-4 text-sm font-body">
            <span className="text-muted-foreground">Rubriken:</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Analysen</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Meinungen</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Kultur</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Marktstruktur</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Altcoins</span>
            <span className="text-foreground/30">|</span>
            <span className="text-muted-foreground">Community:</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Top Autoren</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Leaderboard</span>
          </div>
          
          {/* Copyright */}
          <div className="text-center text-xs text-muted-foreground font-body">
            <p>© 2025 Financial Retarded Times • „Keine Finanzberatung – nur Entertainment"</p>
          </div>
        </div>
      </footer>
    </main>
  )
}
