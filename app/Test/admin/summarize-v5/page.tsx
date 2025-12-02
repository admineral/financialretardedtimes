'use client'

import { useState, useCallback, useEffect } from 'react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SparklesIcon, RefreshCwIcon } from 'lucide-react'
import Link from 'next/link'
import { LandingPageSchema, type LandingPageData } from './schemas'

interface CacheStats {
  totalMessages: number
}

export default function SummarizeV5Page() {
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const [messageLimit, setMessageLimit] = useState('500')
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [hasStarted, setHasStarted] = useState(false)
  const [currentDate, setCurrentDate] = useState<string>('')

  const { 
    object: dataObject, 
    submit: submitGeneration, 
    isLoading,
    error,
    stop: stopGeneration
  } = useObject({
    api: '/Test/admin/api/summarize-v5',
    schema: LandingPageSchema,
  })

  useEffect(() => {
    const now = new Date()
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }
    setCurrentDate(now.toLocaleDateString('de-DE', options))
  }, [])

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/Test/admin/api/cache-stats?messagesLimit=1')
        if (response.ok) {
          const data = await response.json()
          setCacheStats({ totalMessages: data.totalMessages })
          if (data.totalMessages < 500) {
            setMessageLimit(data.totalMessages.toString())
          }
        }
      } catch (err) {
        console.error('Failed to fetch cache stats:', err)
      } finally {
        setIsLoadingStats(false)
      }
    }
    fetchStats()
  }, [])

  const getMessageOptions = () => {
    if (!cacheStats) return ['100', '250', '500']
    const total = cacheStats.totalMessages
    const options: string[] = []
    if (total >= 100) options.push('100')
    if (total >= 250) options.push('250')
    if (total >= 500) options.push('500')
    if (total >= 1000) options.push('1000')
    if (total >= 2000) options.push('2000')
    if (total > 0) options.push(total.toString())
    return options
  }

  const generateContent = useCallback(() => {
    setHasStarted(true)
    submitGeneration({ messageLimit: parseInt(messageLimit) })
  }, [messageLimit, submitGeneration])

  const data = dataObject as Partial<LandingPageData> | undefined

  const getCategoryStyle = (category: string) => {
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

  // Show initial state if not started
  if (!hasStarted) {
    return (
      <main className="min-h-screen bg-background">
        {/* Top Bar */}
        <div className="w-full border-b border-foreground/10 py-2">
          <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 flex justify-between items-center text-xs text-muted-foreground">
            <span>{currentDate || 'Loading...'}</span>
            <div className="flex items-center gap-4">
              <span className="hidden sm:inline">Vol. 1 • AI Edition</span>
              <ThemeSwitcher />
              <Link href="/Test/admin/cache" className="hover:text-foreground">← Admin</Link>
            </div>
          </div>
        </div>

        {/* Masthead */}
        <header className="w-full py-4 sm:py-6 border-b-4 border-double border-foreground/60">
          <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 text-center">
            <h1 className="font-masthead text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl tracking-wide text-foreground">
              Financial Retarded Times
            </h1>
            <p className="font-headline text-[10px] sm:text-xs md:text-sm lg:text-base tracking-[0.2em] sm:tracking-[0.3em] uppercase text-muted-foreground mt-1 sm:mt-2">
              AI Generated Edition • Die Stimme des Krypto-Chats
            </p>
          </div>
        </header>

        {/* Generate CTA */}
        <div className="w-full px-4 py-16 text-center">
          <SparklesIcon className="h-16 w-16 mx-auto mb-6 text-primary/50" />
          <h2 className="font-headline text-2xl font-bold mb-2">Generate AI Titelseite</h2>
          <p className="text-muted-foreground max-w-md mx-auto mb-6 font-body">
            Klicke auf Generate um eine KI-generierte Titelseite aus den Chat-Nachrichten zu erstellen.
          </p>
          <div className="flex items-center justify-center gap-4 mb-6">
            <Select value={messageLimit} onValueChange={setMessageLimit} disabled={isLoadingStats}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getMessageOptions().map((option) => (
                  <SelectItem key={option} value={option}>
                    {parseInt(option).toLocaleString()} msgs
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={generateContent} disabled={isLoadingStats} size="lg" className="bg-primary">
              <SparklesIcon className="h-5 w-5 mr-2" />
              Generate
            </Button>
          </div>
          {cacheStats && (
            <p className="text-xs text-muted-foreground">
              {cacheStats.totalMessages.toLocaleString()} messages available
            </p>
          )}
        </div>
      </main>
    )
  }

  // Main Layout - Exact 1:1 copy of landing page
  return (
    <main className="min-h-screen bg-background">
      {/* Top Bar */}
      <div className="w-full border-b border-foreground/10 py-2">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 flex justify-between items-center text-xs text-muted-foreground">
          <span>{currentDate || 'Loading...'}</span>
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline">Vol. 1 • AI Edition</span>
            <ThemeSwitcher />
            <Link href="/Test/admin/cache" className="hover:text-foreground">← Admin</Link>
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
            AI Generated Edition • Die Stimme des Krypto-Chats
          </p>
        </div>
      </header>

      {/* Navigation */}
      <nav className="w-full border-b border-foreground/20 py-2 sm:py-3 sticky top-0 z-50 bg-background/95 backdrop-blur-sm">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex gap-3 sm:gap-4 md:gap-6 font-headline text-xs sm:text-sm tracking-wide">
            <Link href="/" className="hover:text-primary transition-colors font-semibold">Analysen</Link>
            <Link href="/" className="hover:text-primary transition-colors">Community</Link>
            <Link href="/" className="hover:text-primary transition-colors">Trending</Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {isLoading && (
              <span className="flex items-center gap-1.5 text-xs text-amber-600">
                <RefreshCwIcon className="h-3 w-3 animate-spin" />
                Streaming...
              </span>
            )}
            <Button
              onClick={generateContent}
              disabled={isLoading}
              size="sm"
              variant={isLoading ? "outline" : "default"}
              className="text-xs"
            >
              {isLoading ? (
                <><RefreshCwIcon className="h-3 w-3 mr-1 animate-spin" /> Generating</>
              ) : (
                <><SparklesIcon className="h-3 w-3 mr-1" /> Regenerate</>
              )}
            </Button>
            {isLoading && (
              <Button onClick={stopGeneration} variant="destructive" size="sm" className="text-xs">
                Stop
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Error */}
      {error && (
        <div className="w-full px-4 py-4 bg-destructive/10 border-b border-destructive/30">
          <p className="text-center text-destructive text-sm">{error.message}</p>
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
                {(data?.topTraders || [{ username: '...', initial: '?' }, { username: '...', initial: '?' }, { username: '...', initial: '?' }]).map((trader, idx) => (
                  <li key={idx} className={`flex items-center gap-2 ${isLoading && !data?.topTraders ? 'animate-pulse' : ''}`}>
                    <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                      {trader.initial || '?'}
                    </span>
                    {trader.username || '...'}
                  </li>
                ))}
              </ul>

              <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground mt-8 mb-4 pb-2 border-b border-foreground/20">
                Trending Themen
              </h3>
              <ul className="space-y-2 font-body text-sm">
                {(data?.trendingTopics || ['...', '...', '...', '...']).map((topic, idx) => (
                  <li key={idx} className={`text-primary hover:underline cursor-pointer ${isLoading && !data?.trendingTopics ? 'animate-pulse' : ''}`}>
                    #{topic}
                  </li>
                ))}
              </ul>

              <div className="mt-8 pt-4 border-t border-foreground/20">
                <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground mb-3">
                  Community Highlights
                </h3>
                <p className="text-xs text-muted-foreground font-body leading-relaxed">
                  Top Beitragender diese Woche
                </p>
                <p className={`font-headline font-semibold text-sm mt-1 ${isLoading && !data?.communityHighlight ? 'animate-pulse' : ''}`}>
                  {data?.communityHighlight?.username || '...'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data?.communityHighlight?.contributionCount || '?'} {data?.communityHighlight?.label || 'Qualitätsbeiträge'}
                </p>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="lg:col-span-7">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-4 sm:mb-6 pb-2 border-b-2 border-foreground/60">
              <h2 className="font-headline text-xl sm:text-2xl font-bold">Titelseite</h2>
              <div className="flex gap-1 sm:gap-2 text-[10px] sm:text-xs font-headline">
                <button className="px-2 sm:px-3 py-1 border border-foreground/40 hover:bg-muted transition-colors">AI GENERATED</button>
                <button className="px-2 sm:px-3 py-1 border border-foreground/20 hover:bg-muted transition-colors text-muted-foreground hidden sm:block">TRENDING</button>
                <button className="px-2 sm:px-3 py-1 border border-foreground/20 hover:bg-muted transition-colors text-muted-foreground hidden sm:block">VERIFIZIERT</button>
              </div>
            </div>

            {/* Featured Article */}
            <article className={`mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-foreground/20 ${isLoading && !data?.featuredArticle?.headline ? 'animate-pulse' : ''}`}>
              <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
                <span className="text-[10px] sm:text-xs font-headline uppercase tracking-wider text-muted-foreground">
                  {data?.featuredArticle?.author || 'Redaktion'}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-[10px] sm:text-xs text-muted-foreground">
                  {data?.featuredArticle?.date || '...'}
                </span>
                {data?.featuredArticle?.category && (
                  <span className={`ml-auto px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded border ${getCategoryStyle(data.featuredArticle.category)}`}>
                    {data.featuredArticle.category}
                  </span>
                )}
              </div>
              <h3 className="font-headline text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold leading-tight mb-3 sm:mb-4 hover:text-primary/80 cursor-pointer transition-colors">
                {data?.featuredArticle?.headline || 'Artikel wird generiert...'}
              </h3>
              <p className="font-body text-sm sm:text-base md:text-lg leading-relaxed text-muted-foreground mb-3 sm:mb-4">
                {data?.featuredArticle?.summary || '...'}
              </p>
              {data?.featuredArticle?.keyQuote && (
                <blockquote className="border-l-4 border-foreground/30 pl-3 sm:pl-4 py-2 my-3 sm:my-4 italic font-body text-muted-foreground text-sm sm:text-base">
                  „{data.featuredArticle.keyQuote}"
                </blockquote>
              )}
              <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                {(data?.featuredArticle?.contributors || []).map((contributor, idx) => (
                  <span key={idx} className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted text-[10px] sm:text-xs font-body rounded">
                    @{contributor}
                  </span>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm">
                <Link href="/" className="text-primary font-headline hover:underline">Weiterlesen →</Link>
              </div>
            </article>

            {/* Secondary Article */}
            <article className={`mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-foreground/20 ${isLoading && !data?.secondaryArticle?.headline ? 'animate-pulse' : ''}`}>
              <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
                <span className="text-[10px] sm:text-xs font-headline uppercase tracking-wider text-muted-foreground">
                  {data?.secondaryArticle?.author || '...'}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-[10px] sm:text-xs text-muted-foreground">
                  {data?.secondaryArticle?.date || '...'}
                </span>
                {data?.secondaryArticle?.category && (
                  <span className={`ml-auto px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded border ${getCategoryStyle(data.secondaryArticle.category)}`}>
                    {data.secondaryArticle.category}
                  </span>
                )}
              </div>
              <h3 className="font-headline text-lg sm:text-xl md:text-2xl font-bold leading-tight mb-2 sm:mb-3 hover:text-primary/80 cursor-pointer transition-colors">
                {data?.secondaryArticle?.headline || 'Artikel wird generiert...'}
              </h3>
              <p className="font-body text-sm sm:text-base leading-relaxed text-muted-foreground mb-3 sm:mb-4">
                {data?.secondaryArticle?.summary || '...'}
              </p>
              <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                {(data?.secondaryArticle?.contributors || []).map((contributor, idx) => (
                  <span key={idx} className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted text-[10px] sm:text-xs font-body rounded">
                    @{contributor}
                  </span>
                ))}
              </div>
            </article>

            {/* Third Article */}
            <article className={`mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-foreground/20 ${isLoading && !data?.thirdArticle?.headline ? 'animate-pulse' : ''}`}>
              <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
                <span className="text-[10px] sm:text-xs font-headline uppercase tracking-wider text-muted-foreground">
                  {data?.thirdArticle?.author || '...'}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-[10px] sm:text-xs text-muted-foreground">
                  {data?.thirdArticle?.date || '...'}
                </span>
                {data?.thirdArticle?.category && (
                  <span className={`ml-auto px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded border ${getCategoryStyle(data.thirdArticle.category)}`}>
                    {data.thirdArticle.category}
                  </span>
                )}
              </div>
              <h3 className="font-headline text-lg sm:text-xl md:text-2xl font-bold leading-tight mb-2 sm:mb-3 hover:text-primary/80 cursor-pointer transition-colors">
                {data?.thirdArticle?.headline || 'Artikel wird generiert...'}
              </h3>
              <p className="font-body text-sm sm:text-base leading-relaxed text-muted-foreground">
                {data?.thirdArticle?.summary || '...'}
              </p>
            </article>

            {/* More Articles Teaser */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {(data?.moreArticles || [{ category: '...', headline: '...', teaser: '...' }, { category: '...', headline: '...', teaser: '...' }]).map((article, idx) => (
                <article key={idx} className={`pb-3 sm:pb-4 border-b border-foreground/10 ${isLoading && !data?.moreArticles ? 'animate-pulse' : ''}`}>
                  <span className="text-[10px] sm:text-xs text-muted-foreground font-headline uppercase tracking-wider">
                    {article.category}
                  </span>
                  <h4 className="font-headline text-sm sm:text-base font-semibold mt-1 hover:text-primary/80 cursor-pointer transition-colors">
                    {article.headline}
                  </h4>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1 font-body">
                    {article.teaser}
                  </p>
                </article>
              ))}
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
                
                {(data?.shortNews || [
                  { author: '...', date: '...', category: 'MEINUNG' as const, headline: '...', teaser: '...', fullText: '...', topics: '...' },
                  { author: '...', date: '...', category: 'KULTUR' as const, headline: '...', teaser: '...', fullText: '...', topics: '...' }
                ]).map((news, idx) => (
                  <article key={idx} className={`mb-4 pb-4 border-b border-foreground/10 ${isLoading && !data?.shortNews ? 'animate-pulse' : ''}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground">{news.author}</span>
                      <span className="text-muted-foreground text-xs">•</span>
                      <span className="text-xs text-muted-foreground">{news.date}</span>
                      <span className={`ml-auto px-1.5 py-0.5 text-[10px] font-semibold rounded ${getCategoryStyle(news.category)}`}>
                        {news.category}
                      </span>
                    </div>
                    <h4 className="font-headline text-sm font-semibold leading-snug hover:text-primary/80 cursor-pointer">
                      {news.headline}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 font-body line-clamp-2">
                      {news.teaser}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-muted-foreground">{news.topics}</span>
                    </div>
                  </article>
                ))}
              </div>

              {/* AI Generation Info (instead of Chat) */}
              <div className="border-2 border-foreground/30 bg-card">
                <div className="px-4 py-3 border-b-2 border-foreground/30 bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-headline text-sm font-bold uppercase tracking-wider">AI Generation</h3>
                      <p className="text-[10px] text-muted-foreground font-body">Powered by GPT-4</p>
                    </div>
                    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className={`w-2 h-2 rounded-full ${isLoading ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`}></span>
                      {isLoading ? 'STREAMING' : 'READY'}
                    </span>
                  </div>
                </div>
                <div className="p-4 text-xs text-muted-foreground font-body space-y-2">
                  <p>Messages analyzed: <span className="text-foreground font-medium">{parseInt(messageLimit).toLocaleString()}</span></p>
                  {cacheStats && (
                    <p>Available: <span className="text-foreground font-medium">{cacheStats.totalMessages.toLocaleString()}</span></p>
                  )}
                  <div className="pt-2 border-t border-foreground/10">
                    <p className="text-muted-foreground/70">
                      Content is AI-generated from TradingView chat data.
                    </p>
                  </div>
                </div>
              </div>

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
            <p>© 2025 Financial Retarded Times • AI Generated Edition • „Keine Finanzberatung – nur Entertainment"</p>
          </div>
        </div>
      </footer>
    </main>
  )
}

