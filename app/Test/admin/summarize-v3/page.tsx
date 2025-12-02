'use client'

import { useState, useCallback, useEffect } from 'react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  SparklesIcon, 
  RefreshCwIcon,
  AlertCircleIcon,
  SettingsIcon
} from 'lucide-react'
import Link from 'next/link'
import { TitelseiteArticleSchema, SCHEMA_REGISTRY, type SchemaType, type TitelseiteArticle } from './schemas'

interface CacheStats {
  totalMessages: number
}

export default function SummarizeV3Page() {
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const [messageLimit, setMessageLimit] = useState('500')
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [hasStarted, setHasStarted] = useState(false)
  const [schemaType, setSchemaType] = useState<SchemaType>('titelseite')
  const [currentDate, setCurrentDate] = useState<string>('')
  const [showSettings, setShowSettings] = useState(false)

  // Streaming for articles
  const { 
    object: articlesObject, 
    submit: submitArticles, 
    isLoading,
    error,
    stop: stopArticles
  } = useObject({
    api: '/Test/admin/api/summarize-v3',
    schema: TitelseiteArticleSchema,
  })

  // Set date on client side
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

  // Fetch stats on mount
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

  const generateArticles = useCallback(() => {
    setHasStarted(true)
    setShowSettings(false)
    submitArticles({ schemaType, messageLimit: parseInt(messageLimit) })
  }, [messageLimit, schemaType, submitArticles])

  const articles = (articlesObject?.articles || []) as TitelseiteArticle[]
  const featuredArticle = articles[0]
  const secondaryArticle = articles[1]
  const thirdArticle = articles[2]
  const sidebarArticles = articles.slice(3, 5)
  const moreArticles = articles.slice(5)

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

  return (
    <main className="min-h-screen bg-background">
      {/* Top Bar */}
      <div className="w-full border-b border-foreground/10 py-2">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 flex justify-between items-center text-xs text-muted-foreground">
          <span>{currentDate || 'Loading...'}</span>
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline">Vol. 1 • AI Edition</span>
            <ThemeSwitcher />
            <Link href="/Test/admin/cache" className="hover:text-foreground transition-colors">
              ← Admin
            </Link>
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
            AI Generated Edition • Powered by Chat Analysis
          </p>
        </div>
      </header>

      {/* Navigation / Controls */}
      <nav className="w-full border-b border-foreground/20 py-2 sm:py-3 sticky top-0 z-50 bg-background/95 backdrop-blur-sm">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex gap-3 sm:gap-4 md:gap-6 font-headline text-xs sm:text-sm tracking-wide">
            <span className="font-semibold text-primary">AI Titelseite</span>
            <Link href="/Test/admin/summarize" className="hover:text-primary transition-colors text-muted-foreground">V1</Link>
            <Link href="/Test/admin/summarize-v2" className="hover:text-primary transition-colors text-muted-foreground">V2</Link>
            <Link href="/Test/admin/summarize-v4" className="hover:text-primary transition-colors text-muted-foreground">V4</Link>
            <Link href="/Test/admin/summarize-v5" className="hover:text-primary transition-colors text-muted-foreground">V5</Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {isLoading && (
              <span className="flex items-center gap-1.5 text-xs text-amber-600">
                <RefreshCwIcon className="h-3 w-3 animate-spin" />
                Streaming...
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              className="h-8 w-8 p-0"
            >
              <SettingsIcon className="h-4 w-4" />
            </Button>
            {!hasStarted ? (
              <Button
                onClick={generateArticles}
                disabled={isLoadingStats}
                size="sm"
                className="bg-primary text-primary-foreground text-xs sm:text-sm font-headline tracking-wide hover:bg-primary/90"
              >
                <SparklesIcon className="h-4 w-4 mr-1" />
                GENERATE
              </Button>
            ) : (
              <Button
                onClick={generateArticles}
                disabled={isLoading}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                <RefreshCwIcon className={`h-3 w-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                Regenerate
              </Button>
            )}
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="absolute top-full left-0 right-0 bg-background border-b border-foreground/20 py-4 px-4 shadow-lg">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Schema:</span>
                <Select value={schemaType} onValueChange={(v) => setSchemaType(v as SchemaType)}>
                  <SelectTrigger className="w-40 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SCHEMA_REGISTRY).map(([key, config]) => (
                      <SelectItem key={key} value={key} className="text-xs">
                        {config.name} ({config.articleCount})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Messages:</span>
                <Select value={messageLimit} onValueChange={setMessageLimit}>
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getMessageOptions().map((option) => (
                      <SelectItem key={option} value={option} className="text-xs">
                        {parseInt(option).toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {cacheStats && (
                <span className="text-xs text-muted-foreground">
                  ({cacheStats.totalMessages.toLocaleString()} available)
                </span>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Error */}
      {error && (
        <div className="w-full px-4 py-4">
          <div className="max-w-2xl mx-auto bg-destructive/10 border border-destructive/30 rounded p-4 flex items-start gap-3">
            <AlertCircleIcon className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-destructive">Generation Failed</p>
              <p className="text-sm text-destructive/80 mt-1">{error.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Initial State */}
      {!hasStarted && !isLoading && (
        <div className="w-full px-4 py-16 text-center">
          <SparklesIcon className="h-16 w-16 mx-auto mb-6 text-primary/50" />
          <h2 className="font-headline text-2xl font-bold mb-2">Generate AI Titelseite</h2>
          <p className="text-muted-foreground max-w-md mx-auto mb-6 font-body">
            Click GENERATE to analyze chat messages and create a newspaper front page with AI-written articles.
          </p>
          <Button onClick={generateArticles} disabled={isLoadingStats} size="lg" className="bg-primary">
            <SparklesIcon className="h-5 w-5 mr-2" />
            Generate Titelseite
          </Button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && articles.length === 0 && (
        <div className="w-full px-4 py-16 text-center">
          <RefreshCwIcon className="h-12 w-12 mx-auto mb-4 text-primary animate-spin" />
          <p className="text-muted-foreground font-body">AI is analyzing chat and writing articles...</p>
        </div>
      )}

      {/* Main Content Grid - Exact Titelseite Layout */}
      {articles.length > 0 && (
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
            
            {/* Left Sidebar */}
            <aside className="lg:col-span-2 hidden lg:block">
              <div className="sticky top-20">
                <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground mb-4 pb-2 border-b border-foreground/20">
                  Top Autoren
                </h3>
                <ul className="space-y-3 font-body text-sm">
                  {articles.slice(0, 3).map((article, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                        {article.author?.[0]?.toUpperCase() || '?'}
                      </span>
                      <span className="truncate">{article.author || 'Unknown'}</span>
                    </li>
                  ))}
                </ul>

                <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground mt-8 mb-4 pb-2 border-b border-foreground/20">
                  Trending Themen
                </h3>
                <ul className="space-y-2 font-body text-sm">
                  {[...new Set(articles.flatMap(a => a.topics || []))].slice(0, 5).map((topic, idx) => (
                    <li key={idx} className="text-primary hover:underline cursor-pointer">
                      #{topic}
                    </li>
                  ))}
                </ul>

                <div className="mt-8 pt-4 border-t border-foreground/20">
                  <h3 className="font-headline text-xs uppercase tracking-widest text-muted-foreground mb-3">
                    Generation Info
                  </h3>
                  <p className="text-xs text-muted-foreground font-body leading-relaxed">
                    {articles.length} articles generated
                  </p>
                  <p className="text-xs text-muted-foreground">
                    from {parseInt(messageLimit).toLocaleString()} messages
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
                  <span className="px-2 sm:px-3 py-1 border border-foreground/40 bg-muted">AI GENERATED</span>
                  {isLoading && (
                    <span className="px-2 py-1 bg-amber-500/20 text-amber-700 dark:text-amber-400 animate-pulse">
                      STREAMING...
                    </span>
                  )}
                </div>
              </div>

              {/* Featured Article */}
              {featuredArticle && (
                <article className={`mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-foreground/20 ${isLoading && articles.length === 1 ? 'animate-pulse' : ''}`}>
                  <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
                    <span className="text-[10px] sm:text-xs font-headline uppercase tracking-wider text-muted-foreground">
                      {featuredArticle.author || 'Redaktion'}
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-[10px] sm:text-xs text-muted-foreground">{featuredArticle.date || 'Today'}</span>
                    {featuredArticle.category && (
                      <span className={`ml-auto px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded border ${getCategoryStyle(featuredArticle.category)}`}>
                        {featuredArticle.category}
                      </span>
                    )}
                  </div>
                  {featuredArticle.headline && (
                    <h3 className="font-headline text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold leading-tight mb-3 sm:mb-4 hover:text-primary/80 cursor-pointer transition-colors">
                      {featuredArticle.headline}
                    </h3>
                  )}
                  {featuredArticle.subheadline && (
                    <p className="font-body text-sm sm:text-base md:text-lg leading-relaxed text-muted-foreground mb-3 sm:mb-4">
                      {featuredArticle.subheadline}
                    </p>
                  )}
                  {featuredArticle.keyQuote && (
                    <blockquote className="border-l-4 border-foreground/30 pl-3 sm:pl-4 py-2 my-3 sm:my-4 italic font-body text-muted-foreground text-sm sm:text-base">
                      „{featuredArticle.keyQuote}"
                    </blockquote>
                  )}
                  {featuredArticle.content && (
                    <p className="font-body text-sm leading-relaxed text-foreground/80 mb-4">
                      {featuredArticle.content}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                    {featuredArticle.contributors?.filter(Boolean).map((contributor, idx) => (
                      <span key={idx} className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted text-[10px] sm:text-xs font-body rounded">
                        @{contributor}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm">
                    <span className="text-primary font-headline cursor-pointer hover:underline">Weiterlesen →</span>
                    <span className="text-[10px] sm:text-xs text-muted-foreground">
                      {featuredArticle.verificationScore !== undefined && (
                        <span className={`font-semibold ${featuredArticle.verificationScore >= 80 ? 'text-green-600' : featuredArticle.verificationScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                          {featuredArticle.verificationScore}% verifiziert
                        </span>
                      )}
                      {featuredArticle.engagement && (
                        <> • {featuredArticle.engagement.readers?.toLocaleString()} Leser • {featuredArticle.engagement.comments} Kommentare • {featuredArticle.engagement.shares} Shares</>
                      )}
                    </span>
                  </div>
                </article>
              )}

              {/* Secondary Article */}
              {secondaryArticle && (
                <article className={`mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-foreground/20 ${isLoading && articles.length === 2 ? 'animate-pulse' : ''}`}>
                  <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
                    <span className="text-[10px] sm:text-xs font-headline uppercase tracking-wider text-muted-foreground">
                      {secondaryArticle.author}
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-[10px] sm:text-xs text-muted-foreground">{secondaryArticle.date}</span>
                    {secondaryArticle.category && (
                      <span className={`ml-auto px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded border ${getCategoryStyle(secondaryArticle.category)}`}>
                        {secondaryArticle.category}
                      </span>
                    )}
                  </div>
                  {secondaryArticle.headline && (
                    <h3 className="font-headline text-lg sm:text-xl md:text-2xl font-bold leading-tight mb-2 sm:mb-3 hover:text-primary/80 cursor-pointer transition-colors">
                      {secondaryArticle.headline}
                    </h3>
                  )}
                  {secondaryArticle.subheadline && (
                    <p className="font-body text-sm sm:text-base leading-relaxed text-muted-foreground mb-3 sm:mb-4">
                      {secondaryArticle.subheadline}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                    {secondaryArticle.contributors?.filter(Boolean).map((contributor, idx) => (
                      <span key={idx} className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-muted text-[10px] sm:text-xs font-body rounded">
                        @{contributor}
                      </span>
                    ))}
                  </div>
                </article>
              )}

              {/* Third Article */}
              {thirdArticle && (
                <article className={`mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-foreground/20 ${isLoading && articles.length === 3 ? 'animate-pulse' : ''}`}>
                  <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
                    <span className="text-[10px] sm:text-xs font-headline uppercase tracking-wider text-muted-foreground">
                      {thirdArticle.author}
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-[10px] sm:text-xs text-muted-foreground">{thirdArticle.date}</span>
                    {thirdArticle.category && (
                      <span className={`ml-auto px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-semibold rounded border ${getCategoryStyle(thirdArticle.category)}`}>
                        {thirdArticle.category}
                      </span>
                    )}
                  </div>
                  {thirdArticle.headline && (
                    <h3 className="font-headline text-lg sm:text-xl md:text-2xl font-bold leading-tight mb-2 sm:mb-3 hover:text-primary/80 cursor-pointer transition-colors">
                      {thirdArticle.headline}
                    </h3>
                  )}
                  {thirdArticle.content && (
                    <p className="font-body text-sm sm:text-base leading-relaxed text-muted-foreground">
                      {thirdArticle.content}
                    </p>
                  )}
                </article>
              )}

              {/* More Articles Grid */}
              {moreArticles.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  {moreArticles.map((article, idx) => (
                    <article key={idx} className={`pb-3 sm:pb-4 border-b border-foreground/10 ${isLoading && idx + 5 === articles.length - 1 ? 'animate-pulse' : ''}`}>
                      {article.category && (
                        <span className="text-[10px] sm:text-xs text-muted-foreground font-headline uppercase tracking-wider">
                          {article.category}
                        </span>
                      )}
                      {article.headline && (
                        <h4 className="font-headline text-sm sm:text-base font-semibold mt-1 hover:text-primary/80 cursor-pointer transition-colors">
                          {article.headline}
                        </h4>
                      )}
                      {article.subheadline && (
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1 font-body">
                          {article.subheadline}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </main>

            {/* Right Sidebar */}
            <aside className="lg:col-span-3">
              <div className="sticky top-20">
                {/* Sidebar Articles */}
                {sidebarArticles.length > 0 && (
                  <div className="hidden lg:block mb-6">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-foreground/20">
                      <h3 className="font-headline text-sm font-bold uppercase tracking-wider">Kurzmeldungen</h3>
                    </div>
                    
                    {sidebarArticles.map((article, idx) => (
                      <article key={idx} className={`mb-4 pb-4 border-b border-foreground/10 ${isLoading && idx + 3 === articles.length - 1 ? 'animate-pulse' : ''}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-muted-foreground">{article.author}</span>
                          <span className="text-muted-foreground text-xs">•</span>
                          <span className="text-xs text-muted-foreground">{article.date}</span>
                          {article.category && (
                            <span className={`ml-auto px-1.5 py-0.5 text-[10px] font-semibold rounded ${getCategoryStyle(article.category)}`}>
                              {article.category}
                            </span>
                          )}
                        </div>
                        {article.headline && (
                          <h4 className="font-headline text-sm font-semibold leading-snug hover:text-primary/80 cursor-pointer">
                            {article.headline}
                          </h4>
                        )}
                        {article.subheadline && (
                          <p className="text-xs text-muted-foreground mt-1 font-body line-clamp-2">
                            {article.subheadline}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          {article.topics && article.topics.length > 0 && (
                            <span className="text-[10px] text-muted-foreground uppercase">
                              {article.topics.slice(0, 2).join(' • ')}
                            </span>
                          )}
                          {article.verificationScore !== undefined && (
                            <span className={`text-[10px] font-semibold ${article.verificationScore >= 80 ? 'text-green-600' : article.verificationScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                              {article.verificationScore}%
                            </span>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}

                {/* Info Box */}
                <div className="border-2 border-foreground/30 bg-card">
                  <div className="px-4 py-3 border-b-2 border-foreground/30 bg-muted/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-headline text-sm font-bold uppercase tracking-wider">AI Generation</h3>
                        <p className="text-[10px] text-muted-foreground font-body">Powered by GPT-4</p>
                      </div>
                      <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <SparklesIcon className="h-3 w-3 text-primary" />
                        {isLoading ? 'ACTIVE' : 'READY'}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 text-xs text-muted-foreground font-body space-y-2">
                    <p>Schema: <span className="text-foreground">{SCHEMA_REGISTRY[schemaType].name}</span></p>
                    <p>Messages: <span className="text-foreground">{parseInt(messageLimit).toLocaleString()}</span></p>
                    <p>Articles: <span className="text-foreground">{articles.length}</span></p>
                    {isLoading && (
                      <div className="flex items-center gap-2 text-amber-600 pt-2">
                        <RefreshCwIcon className="h-3 w-3 animate-spin" />
                        <span>Streaming article {articles.length + 1}...</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stop Button */}
                {isLoading && (
                  <Button
                    onClick={stopArticles}
                    variant="outline"
                    size="sm"
                    className="w-full mt-4 border-destructive/50 text-destructive hover:bg-destructive/10"
                  >
                    Stop Generation
                  </Button>
                )}
              </div>
            </aside>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full border-t-2 border-foreground/20 mt-8 sm:mt-12">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-4 text-sm font-body">
            <span className="text-muted-foreground">Kategorien:</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Analysen</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Meinungen</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Kultur</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Marktstruktur</span>
            <span className="hover:text-primary cursor-pointer transition-colors">Altcoins</span>
          </div>
          <div className="text-center text-xs text-muted-foreground font-body">
            <p>© 2025 Financial Retarded Times • AI Generated Content • „Keine Finanzberatung – nur Entertainment"</p>
          </div>
        </div>
      </footer>
    </main>
  )
}

