'use client'

import { useState, useCallback, useEffect } from 'react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { 
  SparklesIcon, 
  NewspaperIcon, 
  FileTextIcon,
  RefreshCwIcon,
  ClockIcon,
  UsersIcon,
  TrendingUpIcon,
  QuoteIcon,
  CopyIcon,
  CheckIcon,
  AlertCircleIcon,
  MessageSquareIcon,
  HashIcon,
  DatabaseIcon,
  ZapIcon
} from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import Link from 'next/link'
import { z } from 'zod'

// Schemas (must match the API)
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

const SummarySchema = z.object({
  overview: z.string(),
  mainTopics: z.array(z.object({
    topic: z.string(),
    description: z.string(),
    participants: z.array(z.string())
  })),
  sentiment: z.enum(['bullish', 'bearish', 'neutral', 'mixed']),
  activeUsers: z.array(z.object({
    username: z.string(),
    messageCount: z.number(),
    role: z.string()
  })),
  notableQuotes: z.array(z.object({
    quote: z.string(),
    author: z.string(),
    context: z.string()
  })),
  trendingCoins: z.array(z.string()),
})

type Article = z.infer<typeof ArticleSchema>['articles'][number]
type Summary = z.infer<typeof SummarySchema>
type PartialArticle = Partial<Article> | undefined
type TopicDetail = z.infer<typeof SummarySchema>['mainTopics'][number]
type ActiveUser = z.infer<typeof SummarySchema>['activeUsers'][number]
type NotableQuote = z.infer<typeof SummarySchema>['notableQuotes'][number]
type PartialTopicDetail = Partial<TopicDetail> | undefined
type PartialActiveUser = Partial<ActiveUser> | undefined
type PartialNotableQuote = Partial<NotableQuote> | undefined

interface CacheStats {
  totalMessages: number
  oldestMessage?: string
  newestMessage?: string
}

export default function SummarizePage() {
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const [messageLimit, setMessageLimit] = useState('500')
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState('articles')
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [currentMode, setCurrentMode] = useState<'articles' | 'summary' | null>(null)

  // Streaming for articles
  const { 
    object: articlesObject, 
    submit: submitArticles, 
    isLoading: isLoadingArticles,
    error: articlesError,
    stop: stopArticles
  } = useObject({
    api: '/Test/admin/api/summarize-stream',
    schema: ArticleSchema,
  })

  // Streaming for summary
  const { 
    object: summaryObject, 
    submit: submitSummary, 
    isLoading: isLoadingSummary,
    error: summaryError,
    stop: stopSummary
  } = useObject({
    api: '/Test/admin/api/summarize-stream',
    schema: SummarySchema,
  })

  const isLoading = isLoadingArticles || isLoadingSummary
  const error = articlesError || summaryError

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

  const generateContent = useCallback((mode: 'articles' | 'summary') => {
    setCurrentMode(mode)
    setActiveTab(mode)
    
    const payload = { mode, messageLimit: parseInt(messageLimit) }
    
    if (mode === 'articles') {
      submitArticles(payload)
    } else {
      submitSummary(payload)
    }
  }, [messageLimit, submitArticles, submitSummary])

  const handleStop = () => {
    if (isLoadingArticles) stopArticles()
    if (isLoadingSummary) stopSummary()
  }

  const copyArticle = async (article: Article, index: number) => {
    const text = `# ${article.headline}

*${article.subheadline}*

**Kategorie:** ${article.category}
**Autor:** ${article.author}
**Beitragende:** ${article.contributors?.join(', ') || ''}

---

${article.fullContent}

> "${article.keyQuote}"

**Themen:** ${article.topics?.map(t => `#${t}`).join(' ') || ''}
**Verifizierung:** ${article.verificationScore}%`

    await navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'ANALYSE': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'MEINUNG': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      'KULTUR': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      'MARKTSTRUKTUR': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'ALTCOINS': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      'BREAKING': 'bg-red-500/20 text-red-400 border-red-500/30',
    }
    return colors[category] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'
  }

  const getSentimentColor = (sentiment: string) => {
    const colors: Record<string, string> = {
      'bullish': 'text-green-400 bg-green-500/20',
      'bearish': 'text-red-400 bg-red-500/20',
      'neutral': 'text-slate-400 bg-slate-500/20',
      'mixed': 'text-amber-400 bg-amber-500/20',
    }
    return colors[sentiment] || 'text-slate-400 bg-slate-500/20'
  }

  // Calculate streaming progress
  const getArticlesProgress = () => {
    if (!articlesObject?.articles) return 0
    const articles = articlesObject.articles
    let progress = 0
    articles.forEach((article) => {
      if (article?.headline) progress += 2
      if (article?.subheadline) progress += 2
      if (article?.fullContent) progress += 10
      if (article?.keyQuote) progress += 2
      if (article?.summary) progress += 2
      if (article?.topics?.length) progress += 2
    })
    return Math.min(progress, 100)
  }

  const hasContent = (currentMode === 'articles' && articlesObject?.articles?.length) || 
                     (currentMode === 'summary' && summaryObject?.overview)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
              <SparklesIcon className="h-7 w-7 md:h-8 md:w-8 text-amber-500" />
              AI Chat Summarizer
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                <ZapIcon className="h-3 w-3 mr-1" />
                Streaming
              </Badge>
            </h1>
            <p className="text-slate-400 mt-1">
              Generate newspaper articles and summaries from chat data with real-time streaming
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/Test/admin/summarize-v5">
              <Button variant="outline" size="sm" className="border-cyan-600 text-cyan-400 hover:bg-cyan-900/30">
                V5 1:1 Layout →
              </Button>
            </Link>
            <Link href="/Test/admin/summarize-v4">
              <Button variant="outline" size="sm" className="border-purple-600 text-purple-400 hover:bg-purple-900/30">
                V4 Full Analysis →
              </Button>
            </Link>
            <Link href="/Test/admin/summarize-v3">
              <Button variant="outline" size="sm" className="border-green-600 text-green-400 hover:bg-green-900/30">
                V3 Titelseite →
              </Button>
            </Link>
            <Link href="/Test/admin/summarize-v2">
              <Button variant="outline" size="sm" className="border-amber-600 text-amber-400 hover:bg-amber-900/30">
                V2 Newspaper →
              </Button>
            </Link>
            <Link href="/Test/admin/cache">
              <Button variant="outline" size="sm" className="border-slate-600 text-slate-300 hover:bg-slate-700">
                ← Back to Cache
              </Button>
            </Link>
          </div>
        </div>

        {/* Controls */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-lg flex items-center gap-2">
              Generation Settings
              {isLoadingStats && <RefreshCwIcon className="h-4 w-4 animate-spin text-slate-500" />}
            </CardTitle>
            <CardDescription className="text-slate-400">
              {cacheStats ? (
                <span className="flex items-center gap-2">
                  <DatabaseIcon className="h-4 w-4" />
                  <span className="text-green-400 font-medium">{cacheStats.totalMessages.toLocaleString()}</span> messages available in cache
                </span>
              ) : (
                'Loading available messages...'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
              <div className="w-full sm:w-auto">
                <label className="text-sm text-slate-400 mb-2 block">Messages to analyze</label>
                <Select value={messageLimit} onValueChange={setMessageLimit} disabled={isLoadingStats || isLoading}>
                  <SelectTrigger className="w-full sm:w-48 bg-slate-900 border-slate-600 text-white">
                    <SelectValue placeholder="Select amount" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {getMessageOptions().map((option) => (
                      <SelectItem 
                        key={option} 
                        value={option}
                        className="text-white hover:bg-slate-800 focus:bg-slate-800"
                      >
                        {option === cacheStats?.totalMessages.toString() 
                          ? `All (${parseInt(option).toLocaleString()})` 
                          : parseInt(option).toLocaleString()} messages
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => generateContent('articles')}
                  disabled={isLoading || isLoadingStats}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {isLoadingArticles ? (
                    <RefreshCwIcon className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <NewspaperIcon className="h-4 w-4 mr-2" />
                  )}
                  Generate Articles
                </Button>
                
                <Button
                  onClick={() => generateContent('summary')}
                  disabled={isLoading || isLoadingStats}
                  variant="outline"
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  {isLoadingSummary ? (
                    <RefreshCwIcon className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileTextIcon className="h-4 w-4 mr-2" />
                  )}
                  Generate Summary
                </Button>

                {isLoading && (
                  <Button
                    onClick={handleStop}
                    variant="destructive"
                    size="sm"
                  >
                    Stop
                  </Button>
                )}
              </div>
            </div>
            
            {/* Streaming Progress */}
            {isLoading && (
              <div className="mt-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700 space-y-3">
                <div className="flex items-center gap-3">
                  <SparklesIcon className="h-5 w-5 text-amber-500 animate-pulse" />
                  <span className="text-slate-300">
                    AI is streaming {currentMode === 'articles' ? 'articles' : 'summary'}...
                  </span>
                </div>
                {currentMode === 'articles' && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Generating articles</span>
                      <span>{articlesObject?.articles?.length || 0} / 5 articles</span>
                    </div>
                    <Progress value={getArticlesProgress()} className="h-2" />
                  </div>
                )}
                <p className="text-xs text-slate-500">Content appears as it&apos;s generated. You can stop anytime.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Card className="border-2 border-red-500/50 bg-red-500/10">
            <CardContent className="py-4 flex items-center gap-3">
              <AlertCircleIcon className="h-5 w-5 text-red-500 flex-shrink-0" />
              <div>
                <span className="text-red-400 font-medium">Error generating content</span>
                <p className="text-red-400/80 text-sm mt-1">{error.message}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results - Show as soon as we have partial content */}
        {(hasContent || isLoading) && currentMode && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <TabsList className="bg-slate-800 border-slate-700">
                <TabsTrigger value="articles" className="data-[state=active]:bg-slate-700">
                  <NewspaperIcon className="h-4 w-4 mr-2" />
                  Articles {articlesObject?.articles?.length ? `(${articlesObject.articles.length})` : ''}
                </TabsTrigger>
                <TabsTrigger value="summary" className="data-[state=active]:bg-slate-700">
                  <FileTextIcon className="h-4 w-4 mr-2" />
                  Summary
                </TabsTrigger>
              </TabsList>
              
              <div className="flex items-center gap-4 text-sm text-slate-400">
                <span className="flex items-center gap-1">
                  <MessageSquareIcon className="h-4 w-4" />
                  {parseInt(messageLimit).toLocaleString()} messages
                </span>
                {isLoading && (
                  <Badge className="bg-amber-500/20 text-amber-400 animate-pulse">
                    <ZapIcon className="h-3 w-3 mr-1" />
                    Streaming...
                  </Badge>
                )}
              </div>
            </div>

            {/* Articles Tab */}
            <TabsContent value="articles">
              {articlesObject?.articles && articlesObject.articles.length > 0 ? (
                <div className="space-y-6">
                  {articlesObject.articles.map((article, idx) => (
                    <Card key={idx} className={`bg-slate-800/50 border-slate-700 overflow-hidden transition-all ${
                      isLoadingArticles && idx === articlesObject.articles!.length - 1 ? 'border-amber-500/50' : ''
                    }`}>
                      <CardHeader className="pb-3">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {article?.category && (
                            <Badge className={getCategoryColor(article.category)}>
                              {article.category}
                            </Badge>
                          )}
                          {article?.verificationScore !== undefined && (
                            <span className={`ml-auto text-xs px-2 py-1 rounded ${
                              article.verificationScore >= 80 ? 'bg-green-500/20 text-green-400' :
                              article.verificationScore >= 50 ? 'bg-amber-500/20 text-amber-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              {article.verificationScore}% verifiziert
                            </span>
                          )}
                        </div>
                        {article?.headline && (
                          <CardTitle className="text-white text-xl md:text-2xl leading-tight">
                            {article.headline}
                          </CardTitle>
                        )}
                        {article?.subheadline && (
                          <CardDescription className="text-slate-400 text-base">
                            {article.subheadline}
                          </CardDescription>
                        )}
                      </CardHeader>
                      
                      <CardContent className="space-y-4">
                        {article?.author && (
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="text-slate-500">Von</span>
                            <span className="text-amber-400 font-medium">{article.author}</span>
                            {article.contributors && article.contributors.length > 0 && (
                              <>
                                <span className="text-slate-500">mit</span>
                                {article.contributors.filter(Boolean).map((c, i) => (
                                  <span key={i} className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded text-xs">
                                    @{c}
                                  </span>
                                ))}
                              </>
                            )}
                          </div>
                        )}
                        
                        {article?.summary && (
                          <>
                            <Separator className="bg-slate-700" />
                            <p className="text-slate-300 text-sm leading-relaxed">
                              {article.summary}
                            </p>
                          </>
                        )}
                        
                        {article?.fullContent && (
                          <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                            <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">
                              {article.fullContent}
                            </p>
                          </div>
                        )}
                        
                        {article?.keyQuote && (
                          <blockquote className="border-l-4 border-amber-500/50 pl-4 py-2 italic">
                            <QuoteIcon className="h-4 w-4 text-amber-500/50 mb-1" />
                            <p className="text-slate-300">&ldquo;{article.keyQuote}&rdquo;</p>
                          </blockquote>
                        )}
                        
                        {(article?.topics?.length || article?.headline) && (
                          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                            <div className="flex flex-wrap gap-2">
                            {article.topics?.filter(Boolean).map((topic, i) => (
                              <span key={i} className="text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer">
                                #{topic}
                              </span>
                            ))}
                            </div>
                            
                            {article.headline && article.fullContent && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyArticle(article as Article, idx)}
                                className="border-slate-600 text-slate-300 hover:bg-slate-700"
                              >
                                {copiedIndex === idx ? (
                                  <><CheckIcon className="h-4 w-4 mr-2 text-green-500" /> Copied!</>
                                ) : (
                                  <><CopyIcon className="h-4 w-4 mr-2" /> Copy Article</>
                                )}
                              </Button>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardContent className="py-12 text-center text-slate-500">
                    {isLoadingArticles ? (
                      <div className="flex flex-col items-center gap-4">
                        <RefreshCwIcon className="h-12 w-12 animate-spin text-amber-500/50" />
                        <p>Starting article generation...</p>
                      </div>
                    ) : (
                      <>
                        <NewspaperIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Click &ldquo;Generate Articles&rdquo; to create newspaper-style articles from chat data</p>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Summary Tab */}
            <TabsContent value="summary">
              {summaryObject ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Overview */}
                  {summaryObject.overview && (
                    <Card className="bg-slate-800/50 border-slate-700 lg:col-span-2">
                      <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                          <FileTextIcon className="h-5 w-5 text-blue-500" />
                          Overview
                          {isLoadingSummary && <RefreshCwIcon className="h-4 w-4 animate-spin text-slate-500" />}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-slate-300 leading-relaxed">{summaryObject.overview}</p>
                        {summaryObject.sentiment && (
                          <div className="mt-4 flex items-center gap-3">
                            <span className="text-slate-500 text-sm">Market Sentiment:</span>
                            <Badge className={getSentimentColor(summaryObject.sentiment)}>
                              {summaryObject.sentiment.toUpperCase()}
                            </Badge>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Main Topics */}
                  {summaryObject.mainTopics && summaryObject.mainTopics.length > 0 && (
                    <Card className="bg-slate-800/50 border-slate-700">
                      <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                          <HashIcon className="h-5 w-5 text-purple-500" />
                          Main Topics
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[300px]">
                          <div className="space-y-4">
                            {summaryObject.mainTopics.map((topic, idx) => (
                              <div key={idx} className="p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                                {topic?.topic && <h4 className="font-medium text-white mb-1">{topic.topic}</h4>}
                                {topic?.description && <p className="text-sm text-slate-400 mb-2">{topic.description}</p>}
                                {topic?.participants && (
                                  <div className="flex flex-wrap gap-1">
                                    {topic.participants.filter(Boolean).map((p, i) => (
                                      <span key={i} className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 rounded">
                                        @{p}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  )}

                  {/* Active Users */}
                  {summaryObject.activeUsers && summaryObject.activeUsers.length > 0 && (
                    <Card className="bg-slate-800/50 border-slate-700">
                      <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                          <UsersIcon className="h-5 w-5 text-green-500" />
                          Active Participants
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[300px]">
                          <div className="space-y-3">
                            {summaryObject.activeUsers.map((user, idx) => (
                              <div key={idx} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                                <div>
                                  {user?.username && <span className="font-medium text-white">{user.username}</span>}
                                  {user?.role && <p className="text-xs text-slate-500">{user.role}</p>}
                                </div>
                                {user?.messageCount !== undefined && (
                                  <Badge variant="outline" className="border-slate-600 text-slate-400">
                                    {user.messageCount} msgs
                                  </Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  )}

                  {/* Notable Quotes */}
                  {summaryObject.notableQuotes && summaryObject.notableQuotes.length > 0 && (
                    <Card className="bg-slate-800/50 border-slate-700">
                      <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                          <QuoteIcon className="h-5 w-5 text-amber-500" />
                          Notable Quotes
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[300px]">
                          <div className="space-y-4">
                            {summaryObject.notableQuotes.map((quote, idx) => (
                              <blockquote key={idx} className="border-l-2 border-amber-500/50 pl-3 py-1">
                                {quote?.quote && <p className="text-slate-300 text-sm italic">&ldquo;{quote.quote}&rdquo;</p>}
                                <footer className="mt-1">
                                  {quote?.author && <span className="text-amber-400 text-xs font-medium">— {quote.author}</span>}
                                  {quote?.context && <p className="text-slate-500 text-xs">{quote.context}</p>}
                                </footer>
                              </blockquote>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  )}

                  {/* Trending Coins */}
                  {summaryObject.trendingCoins && summaryObject.trendingCoins.length > 0 && (
                    <Card className="bg-slate-800/50 border-slate-700">
                      <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                          <TrendingUpIcon className="h-5 w-5 text-cyan-500" />
                          Trending Coins
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {summaryObject.trendingCoins.filter(Boolean).map((coin, idx) => (
                            <Badge key={idx} variant="outline" className="border-cyan-500/50 text-cyan-400 text-sm py-1 px-3">
                              {coin}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <Card className="bg-slate-800/50 border-slate-700">
                  <CardContent className="py-12 text-center text-slate-500">
                    {isLoadingSummary ? (
                      <div className="flex flex-col items-center gap-4">
                        <RefreshCwIcon className="h-12 w-12 animate-spin text-amber-500/50" />
                        <p>Starting summary generation...</p>
                      </div>
                    ) : (
                      <>
                        <FileTextIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Click &ldquo;Generate Summary&rdquo; to create a structured summary from chat data</p>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}

        {/* Initial State */}
        {!hasContent && !isLoading && !error && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="py-16 text-center">
              <SparklesIcon className="h-16 w-16 mx-auto mb-6 text-amber-500/50" />
              <h2 className="text-xl font-semibold text-white mb-2">Ready to Generate Content</h2>
              <p className="text-slate-400 max-w-md mx-auto mb-6">
                Use AI to analyze your TradingView chat data and generate newspaper-style articles or structured summaries.
                <br />
                <span className="text-green-400">Now with real-time streaming!</span>
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Button
                  onClick={() => generateContent('articles')}
                  disabled={isLoadingStats}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  <NewspaperIcon className="h-4 w-4 mr-2" />
                  Generate 5 Articles
                </Button>
                <Button
                  onClick={() => generateContent('summary')}
                  disabled={isLoadingStats}
                  variant="outline"
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  <FileTextIcon className="h-4 w-4 mr-2" />
                  Generate Summary
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
