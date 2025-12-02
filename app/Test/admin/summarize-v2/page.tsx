'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  SparklesIcon, 
  NewspaperIcon, 
  RefreshCwIcon,
  QuoteIcon,
  AlertCircleIcon,
  ZapIcon,
  CalendarIcon,
  TrendingUpIcon,
  UsersIcon
} from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import Link from 'next/link'
import { z } from 'zod'

// Schema (must match the API)
const ArticleSchema = z.object({
  articles: z.array(z.object({
    headline: z.string(),
    subheadline: z.string(),
    category: z.enum(['ANALYSE', 'MEINUNG', 'KULTUR', 'MARKTSTRUKTUR', 'ALTCOINS', 'BREAKING']),
    author: z.string(),
    contributors: z.array(z.string()),
    summary: z.string(),
    fullContent: z.string(),
    keyQuote: z.string(),
    topics: z.array(z.string()),
    verificationScore: z.number(),
  }))
})

type Article = z.infer<typeof ArticleSchema>['articles'][number]

interface CacheStats {
  totalMessages: number
  oldestMessage?: string
  newestMessage?: string
}

export default function SummarizeV2Page() {
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const [messageLimit, setMessageLimit] = useState('500')
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [hasStarted, setHasStarted] = useState(false)
  const [currentDate, setCurrentDate] = useState<string>('')

  // Set date on client side only to avoid hydration issues
  useEffect(() => {
    setCurrentDate(format(new Date(), 'EEEE, d. MMMM yyyy', { locale: de }))
  }, [])

  // Streaming for articles
  const { 
    object: articlesObject, 
    submit: submitArticles, 
    isLoading,
    error,
    stop: stopArticles
  } = useObject({
    api: '/Test/admin/api/summarize-stream',
    schema: ArticleSchema,
  })

  // Fetch available message count on mount
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/Test/admin/api/cache-stats?messagesLimit=1')
        if (response.ok) {
          const data = await response.json()
          setCacheStats({
            totalMessages: data.totalMessages,
            oldestMessage: data.syncStatuses?.[0]?.oldest_message_time,
            newestMessage: data.syncStatuses?.[0]?.newest_message_time
          })
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
    submitArticles({ mode: 'articles', messageLimit: parseInt(messageLimit) })
  }, [messageLimit, submitArticles])

  const getCategoryColor = (category: string) => {
    const colors: Record<string, { bg: string; text: string; border: string }> = {
      'ANALYSE': { bg: 'bg-blue-600', text: 'text-white', border: 'border-blue-700' },
      'MEINUNG': { bg: 'bg-amber-600', text: 'text-white', border: 'border-amber-700' },
      'KULTUR': { bg: 'bg-emerald-600', text: 'text-white', border: 'border-emerald-700' },
      'MARKTSTRUKTUR': { bg: 'bg-purple-600', text: 'text-white', border: 'border-purple-700' },
      'ALTCOINS': { bg: 'bg-cyan-600', text: 'text-white', border: 'border-cyan-700' },
      'BREAKING': { bg: 'bg-red-600', text: 'text-white', border: 'border-red-700' },
    }
    return colors[category] || { bg: 'bg-slate-600', text: 'text-white', border: 'border-slate-700' }
  }

  const articles = articlesObject?.articles || []
  const featuredArticle = articles[0]
  const secondaryArticles = articles.slice(1, 3)
  const restArticles = articles.slice(3)

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      {/* Newspaper Header */}
      <header className="bg-[#1a1a1a] text-white">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Link href="/Test/admin/cache" className="text-sm text-neutral-400 hover:text-white transition-colors">
              ← Back to Admin
            </Link>
            <div className="flex items-center gap-4">
              {cacheStats && (
                <span className="text-xs text-neutral-400">
                  {cacheStats.totalMessages.toLocaleString()} messages cached
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Masthead */}
      <div className="bg-[#1a1a1a] text-white border-b-4 border-amber-500">
        <div className="max-w-7xl mx-auto px-4 py-8 text-center">
          <div className="flex items-center justify-center gap-2 text-amber-500 text-sm font-medium tracking-widest mb-2">
            <TrendingUpIcon className="h-4 w-4" />
            CRYPTO · KULTUR · MEINUNGEN
          </div>
          <h1 className="font-serif text-5xl md:text-7xl font-black tracking-tight mb-2" style={{ fontFamily: 'Georgia, serif' }}>
            Financial Retarded Times
          </h1>
          <p className="text-neutral-400 text-sm tracking-wide">
            Die satirische Stimme der Krypto-Community
          </p>
          <div className="flex items-center justify-center gap-6 mt-4 text-xs text-neutral-500">
            <span className="flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" />
              {currentDate || 'Loading...'}
            </span>
            <span className="flex items-center gap-1">
              <UsersIcon className="h-3 w-3" />
              TradingView Bitcoin DE
            </span>
          </div>
        </div>
      </div>

      {/* Generation Controls */}
      {!hasStarted && (
        <div className="bg-gradient-to-b from-neutral-100 to-transparent py-12">
          <div className="max-w-2xl mx-auto px-4 text-center">
            <div className="bg-white rounded-2xl shadow-xl p-8 border border-neutral-200">
              <SparklesIcon className="h-12 w-12 mx-auto mb-4 text-amber-500" />
              <h2 className="text-2xl font-bold text-neutral-900 mb-2" style={{ fontFamily: 'Georgia, serif' }}>
                Generate Today&apos;s Edition
              </h2>
              <p className="text-neutral-600 mb-6">
                AI analyzes chat conversations and creates newspaper-style articles in real-time
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-500">Analyze</span>
                  <Select value={messageLimit} onValueChange={setMessageLimit} disabled={isLoadingStats}>
                    <SelectTrigger className="w-32 bg-neutral-50 border-neutral-300">
                      <SelectValue placeholder="Messages" />
                    </SelectTrigger>
                    <SelectContent>
                      {getMessageOptions().map((option) => (
                        <SelectItem key={option} value={option}>
                          {option === cacheStats?.totalMessages.toString() 
                            ? `All (${parseInt(option).toLocaleString()})` 
                            : parseInt(option).toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-neutral-500">messages</span>
                </div>
                
                <Button
                  onClick={generateArticles}
                  disabled={isLoadingStats}
                  size="lg"
                  className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-8"
                >
                  <NewspaperIcon className="h-5 w-5 mr-2" />
                  Generate Articles
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && articles.length === 0 && (
        <div className="py-16 text-center">
          <div className="inline-flex items-center gap-3 bg-amber-50 text-amber-800 px-6 py-3 rounded-full border border-amber-200">
            <RefreshCwIcon className="h-5 w-5 animate-spin" />
            <span className="font-medium">AI is writing your articles...</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-4">
            <AlertCircleIcon className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Generation Failed</h3>
              <p className="text-red-700 text-sm mt-1">{error.message}</p>
              <Button
                onClick={generateArticles}
                variant="outline"
                size="sm"
                className="mt-4 border-red-300 text-red-700 hover:bg-red-100"
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Streaming Indicator */}
      {isLoading && articles.length > 0 && (
        <div className="bg-amber-50 border-y border-amber-200 py-3">
          <div className="max-w-7xl mx-auto px-4 flex items-center justify-center gap-3">
            <ZapIcon className="h-4 w-4 text-amber-600 animate-pulse" />
            <span className="text-sm text-amber-800 font-medium">
              Streaming article {articles.length} of 5...
            </span>
            <Button
              onClick={stopArticles}
              variant="outline"
              size="sm"
              className="ml-4 h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
            >
              Stop
            </Button>
          </div>
        </div>
      )}

      {/* Articles Grid */}
      {articles.length > 0 && (
        <main className="max-w-7xl mx-auto px-4 py-8">
          {/* Featured Article */}
          {featuredArticle && (
            <article className={`mb-8 transition-all duration-500 ${isLoading && articles.length === 1 ? 'animate-pulse' : ''}`}>
              <div className="grid md:grid-cols-2 gap-8 items-start">
                <div className="bg-gradient-to-br from-neutral-800 to-neutral-900 rounded-xl p-8 text-white aspect-[4/3] flex items-end relative overflow-hidden">
                  <div className="absolute inset-0 opacity-10">
                    <div className="absolute inset-0" style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                    }} />
                  </div>
                  {featuredArticle.category && (
                    <Badge className={`absolute top-4 left-4 ${getCategoryColor(featuredArticle.category).bg} text-sm font-bold tracking-wider`}>
                      {featuredArticle.category}
                    </Badge>
                  )}
                  <div className="relative z-10">
                    <NewspaperIcon className="h-16 w-16 text-amber-500 mb-4" />
                    <p className="text-amber-400 text-sm font-medium">TITELSTORY</p>
                  </div>
                </div>
                
                <div>
                  {featuredArticle.headline && (
                    <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 leading-tight mb-4" style={{ fontFamily: 'Georgia, serif' }}>
                      {featuredArticle.headline}
                    </h2>
                  )}
                  {featuredArticle.subheadline && (
                    <p className="text-xl text-neutral-600 mb-4 leading-relaxed">
                      {featuredArticle.subheadline}
                    </p>
                  )}
                  {featuredArticle.author && (
                    <p className="text-sm text-neutral-500 mb-4">
                      Von <span className="font-semibold text-amber-700">@{featuredArticle.author}</span>
                      {(featuredArticle.contributors?.filter(Boolean).length ?? 0) > 0 && (
                        <span> mit {featuredArticle.contributors?.filter(Boolean).map(c => `@${c}`).join(', ')}</span>
                      )}
                    </p>
                  )}
                  {featuredArticle.summary && (
                    <p className="text-neutral-700 leading-relaxed mb-4">
                      {featuredArticle.summary}
                    </p>
                  )}
                  {featuredArticle.fullContent && (
                    <div className="prose prose-neutral max-w-none">
                      <p className="text-neutral-800 leading-relaxed whitespace-pre-wrap">
                        {featuredArticle.fullContent}
                      </p>
                    </div>
                  )}
                  {featuredArticle.keyQuote && (
                    <blockquote className="mt-6 border-l-4 border-amber-500 pl-4 py-2">
                      <QuoteIcon className="h-5 w-5 text-amber-500 mb-2" />
                      <p className="text-lg italic text-neutral-700">&ldquo;{featuredArticle.keyQuote}&rdquo;</p>
                    </blockquote>
                  )}
                  {(featuredArticle.topics?.filter(Boolean).length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-2 mt-6">
                      {featuredArticle.topics?.filter(Boolean).map((topic, i) => (
                        <span key={i} className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
                          #{topic}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </article>
          )}

          {/* Secondary Articles Row */}
          {secondaryArticles.length > 0 && (
            <div className="grid md:grid-cols-2 gap-8 mb-8">
              {secondaryArticles.map((article, idx) => (
                <article 
                  key={idx} 
                  className={`border-t-2 border-neutral-200 pt-6 transition-all duration-500 ${
                    isLoading && idx + 1 === articles.length - 1 ? 'animate-pulse' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    {article?.category && (
                      <Badge className={`${getCategoryColor(article.category).bg} text-xs font-bold`}>
                        {article.category}
                      </Badge>
                    )}
                    {article?.verificationScore !== undefined && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        article.verificationScore >= 80 ? 'bg-green-100 text-green-700' :
                        article.verificationScore >= 50 ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {article.verificationScore}% verifiziert
                      </span>
                    )}
                  </div>
                  {article?.headline && (
                    <h3 className="text-xl font-bold text-neutral-900 mb-2 leading-tight" style={{ fontFamily: 'Georgia, serif' }}>
                      {article.headline}
                    </h3>
                  )}
                  {article?.subheadline && (
                    <p className="text-neutral-600 mb-3">{article.subheadline}</p>
                  )}
                  {article?.author && (
                    <p className="text-xs text-neutral-500 mb-3">
                      Von <span className="font-semibold text-amber-700">@{article.author}</span>
                    </p>
                  )}
                  {article?.summary && (
                    <p className="text-sm text-neutral-700 leading-relaxed mb-4">{article.summary}</p>
                  )}
                  {article?.fullContent && (
                    <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                      <p className="text-sm text-neutral-800 leading-relaxed whitespace-pre-wrap">
                        {article.fullContent}
                      </p>
                    </div>
                  )}
                  {article?.keyQuote && (
                    <blockquote className="mt-4 border-l-2 border-amber-400 pl-3 py-1">
                      <p className="text-sm italic text-neutral-600">&ldquo;{article.keyQuote}&rdquo;</p>
                    </blockquote>
                  )}
                  {(article?.topics?.filter(Boolean).length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 mt-4">
                      {article?.topics?.filter(Boolean).map((topic, i) => (
                        <span key={i} className="text-xs text-amber-600">#{topic}</span>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}

          {/* Rest of Articles */}
          {restArticles.length > 0 && (
            <div className="border-t border-neutral-200 pt-8">
              <h4 className="text-xs font-bold text-neutral-500 tracking-widest mb-6">WEITERE ARTIKEL</h4>
              <div className="grid md:grid-cols-3 gap-6">
                {restArticles.map((article, idx) => (
                  <article 
                    key={idx} 
                    className={`transition-all duration-500 ${
                      isLoading && idx + 3 === articles.length - 1 ? 'animate-pulse' : ''
                    }`}
                  >
                    {article?.category && (
                      <Badge className={`${getCategoryColor(article.category).bg} text-xs font-bold mb-3`}>
                        {article.category}
                      </Badge>
                    )}
                    {article?.headline && (
                      <h3 className="text-lg font-bold text-neutral-900 mb-2 leading-tight" style={{ fontFamily: 'Georgia, serif' }}>
                        {article.headline}
                      </h3>
                    )}
                    {article?.subheadline && (
                      <p className="text-sm text-neutral-600 mb-2">{article.subheadline}</p>
                    )}
                    {article?.author && (
                      <p className="text-xs text-neutral-500 mb-2">
                        Von <span className="font-semibold text-amber-700">@{article.author}</span>
                      </p>
                    )}
                    {article?.summary && (
                      <p className="text-sm text-neutral-700 leading-relaxed">{article.summary}</p>
                    )}
                    {article?.fullContent && (
                      <div className="mt-3 bg-neutral-50 rounded-lg p-3 border border-neutral-100">
                        <p className="text-xs text-neutral-700 leading-relaxed whitespace-pre-wrap line-clamp-6">
                          {article.fullContent}
                        </p>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* Regenerate Button */}
          {!isLoading && articles.length > 0 && (
            <div className="mt-12 text-center border-t border-neutral-200 pt-8">
              <Button
                onClick={generateArticles}
                variant="outline"
                size="lg"
                className="border-neutral-300 text-neutral-700 hover:bg-neutral-100"
              >
                <RefreshCwIcon className="h-4 w-4 mr-2" />
                Generate New Edition
              </Button>
            </div>
          )}
        </main>
      )}

      {/* Footer */}
      <footer className="bg-neutral-900 text-neutral-400 py-8 mt-16">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm">
          <p className="font-serif text-xl text-white mb-2" style={{ fontFamily: 'Georgia, serif' }}>
            Financial Retarded Times
          </p>
          <p>AI-generated satire from TradingView chat • Not financial advice</p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <Badge variant="outline" className="border-neutral-700 text-neutral-500">
              <ZapIcon className="h-3 w-3 mr-1" />
              Powered by GPT-4
            </Badge>
          </div>
        </div>
      </footer>
    </div>
  )
}

