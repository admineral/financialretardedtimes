'use client'

import { useState, useCallback, useEffect } from 'react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { 
  SparklesIcon, 
  RefreshCwIcon,
  AlertCircleIcon,
  UsersIcon,
  HashIcon,
  NewspaperIcon,
  DatabaseIcon,
  LayersIcon,
  ActivityIcon,
  BookOpenIcon,
  MessageSquareIcon,
  CalendarIcon,
  TagIcon,
  TrendingUpIcon,
  ZapIcon
} from 'lucide-react'
import Link from 'next/link'
import { ChatAnalysisSchema, type ChatAnalysis, type Topic, type User, type Article } from './schemas'

interface CacheStats {
  totalMessages: number
}

export default function SummarizeV4Page() {
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const [messageLimit, setMessageLimit] = useState('500')
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [hasStarted, setHasStarted] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [currentDate, setCurrentDate] = useState<string>('')

  const { 
    object: analysisObject, 
    submit: submitAnalysis, 
    isLoading,
    error,
    stop: stopAnalysis
  } = useObject({
    api: '/Test/admin/api/summarize-v4',
    schema: ChatAnalysisSchema,
  })

  useEffect(() => {
    const now = new Date()
    setCurrentDate(now.toLocaleDateString('de-DE', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }))
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

  const generateAnalysis = useCallback(() => {
    setHasStarted(true)
    submitAnalysis({ messageLimit: parseInt(messageLimit) })
  }, [messageLimit, submitAnalysis])

  const analysis = analysisObject as Partial<ChatAnalysis> | undefined
  const group = analysis?.group
  const topics = (analysis?.topics || []) as Partial<Topic>[]
  const users = (analysis?.users || []) as Partial<User>[]
  const articles = (analysis?.articles || []) as Partial<Article>[]

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'analysis': 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30',
      'opinion': 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
      'culture': 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    }
    return colors[category] || 'bg-muted text-muted-foreground'
  }

  const getActivityColor = (level: string) => {
    const colors: Record<string, string> = {
      'hoch': 'bg-green-500',
      'mittel': 'bg-amber-500',
      'niedrig_mittel': 'bg-orange-500',
      'niedrig': 'bg-red-500',
    }
    return colors[level] || 'bg-muted'
  }

  const getProgress = () => {
    let progress = 0
    if (group?.id) progress += 10
    if (group?.title) progress += 5
    if (group?.description) progress += 5
    if (group?.meta) progress += 5
    progress += Math.min(topics.length * 5, 25)
    progress += Math.min(users.length * 2, 25)
    progress += Math.min(articles.length * 3, 25)
    return Math.min(progress, 100)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-foreground/10 bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <DatabaseIcon className="h-6 w-6 text-primary" />
                Chat Analysis V4
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Comprehensive structured analysis with topics, users & articles
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground">{currentDate}</span>
              <ThemeSwitcher />
              <Link href="/Test/admin/summarize-v3" className="text-sm text-muted-foreground hover:text-foreground">
                ← V3
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="border-b border-foreground/10 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <MessageSquareIcon className="h-4 w-4 text-muted-foreground" />
              <Select value={messageLimit} onValueChange={setMessageLimit} disabled={isLoading}>
                <SelectTrigger className="w-32 h-9">
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
              {cacheStats && (
                <span className="text-xs text-muted-foreground">
                  of {cacheStats.totalMessages.toLocaleString()}
                </span>
              )}
            </div>

            {!hasStarted ? (
              <Button onClick={generateAnalysis} disabled={isLoadingStats}>
                <SparklesIcon className="h-4 w-4 mr-2" />
                Generate Analysis
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button onClick={generateAnalysis} disabled={isLoading} variant="outline" size="sm">
                  <RefreshCwIcon className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Regenerate
                </Button>
                {isLoading && (
                  <Button onClick={stopAnalysis} variant="destructive" size="sm">
                    Stop
                  </Button>
                )}
              </div>
            )}

            {isLoading && (
              <div className="flex items-center gap-3 ml-auto">
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <ZapIcon className="h-4 w-4 animate-pulse" />
                  <span>Streaming...</span>
                </div>
                <Progress value={getProgress()} className="w-32 h-2" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="py-4 flex items-start gap-3">
              <AlertCircleIcon className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-destructive">Generation Failed</p>
                <p className="text-sm text-destructive/80 mt-1">{error.message}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Initial State */}
      {!hasStarted && !isLoading && (
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <DatabaseIcon className="h-16 w-16 mx-auto mb-6 text-primary/50" />
          <h2 className="text-2xl font-bold mb-2">Generate Structured Chat Analysis</h2>
          <p className="text-muted-foreground mb-6">
            AI will analyze chat messages and create a comprehensive structured dataset including:
          </p>
          <div className="grid grid-cols-2 gap-4 mb-8 text-left max-w-md mx-auto">
            <div className="flex items-center gap-2 text-sm">
              <LayersIcon className="h-4 w-4 text-primary" />
              <span>Group Metadata</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <HashIcon className="h-4 w-4 text-blue-500" />
              <span>4-10 Topics</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <UsersIcon className="h-4 w-4 text-green-500" />
              <span>User Profiles</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <NewspaperIcon className="h-4 w-4 text-amber-500" />
              <span>5-12 Articles</span>
            </div>
          </div>
          <Button onClick={generateAnalysis} disabled={isLoadingStats} size="lg">
            <SparklesIcon className="h-5 w-5 mr-2" />
            Generate Analysis
          </Button>
        </div>
      )}

      {/* Content */}
      {(hasStarted || analysis) && (
        <div className="max-w-7xl mx-auto px-4 py-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="overview" className="gap-2">
                <LayersIcon className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="topics" className="gap-2">
                <HashIcon className="h-4 w-4" />
                Topics {topics.length > 0 && `(${topics.length})`}
              </TabsTrigger>
              <TabsTrigger value="users" className="gap-2">
                <UsersIcon className="h-4 w-4" />
                Users {users.length > 0 && `(${users.length})`}
              </TabsTrigger>
              <TabsTrigger value="articles" className="gap-2">
                <NewspaperIcon className="h-4 w-4" />
                Articles {articles.length > 0 && `(${articles.length})`}
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Group Card */}
                <Card className={`lg:col-span-2 ${isLoading && !group?.description ? 'animate-pulse' : ''}`}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DatabaseIcon className="h-5 w-5 text-primary" />
                      {group?.title || 'Loading group data...'}
                    </CardTitle>
                    {group?.date_range && (
                      <CardDescription className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        {group.date_range}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {group?.description && (
                      <p className="text-muted-foreground">{group.description}</p>
                    )}
                    {group?.meta && (
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Source:</span>
                          <p className="font-medium">{group.meta.source}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Messages:</span>
                          <p className="font-medium">{group.meta.approx_message_count?.toLocaleString()}</p>
                        </div>
                      </div>
                    )}
                    {group?.meta?.moderation_notes && group.meta.moderation_notes.length > 0 && (
                      <div>
                        <span className="text-sm text-muted-foreground">Notes:</span>
                        <ul className="mt-2 space-y-1">
                          {group.meta.moderation_notes.map((note, idx) => (
                            <li key={idx} className="text-sm flex items-start gap-2">
                              <span className="text-primary">•</span>
                              {note}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Stats Cards */}
                <div className="space-y-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <HashIcon className="h-5 w-5 text-blue-500" />
                          <span className="font-medium">Topics</span>
                        </div>
                        <span className="text-2xl font-bold">{topics.length}</span>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <UsersIcon className="h-5 w-5 text-green-500" />
                          <span className="font-medium">Users</span>
                        </div>
                        <span className="text-2xl font-bold">{users.length}</span>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <NewspaperIcon className="h-5 w-5 text-amber-500" />
                          <span className="font-medium">Articles</span>
                        </div>
                        <span className="text-2xl font-bold">{articles.length}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Quick Preview */}
                {topics.length > 0 && (
                  <Card className="lg:col-span-3">
                    <CardHeader>
                      <CardTitle className="text-lg">Topic Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {topics.map((topic, idx) => (
                          <Badge key={idx} variant="outline" className={getCategoryColor(topic.category || '')}>
                            {topic.label}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* Topics Tab */}
            <TabsContent value="topics">
              {topics.length === 0 && isLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <RefreshCwIcon className="h-8 w-8 mx-auto mb-4 animate-spin" />
                  <p>Generating topics...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {topics.map((topic, idx) => (
                    <Card key={idx} className={isLoading && idx === topics.length - 1 ? 'animate-pulse' : ''}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <Badge className={`mb-2 ${getCategoryColor(topic.category || '')}`}>
                              {topic.category}
                            </Badge>
                            <CardTitle className="text-lg">{topic.label}</CardTitle>
                          </div>
                          <code className="text-xs text-muted-foreground">{topic.id}</code>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {topic.summary && (
                          <p className="text-sm text-muted-foreground">{topic.summary}</p>
                        )}
                        {topic.related_users && topic.related_users.length > 0 && (
                          <div>
                            <span className="text-xs text-muted-foreground">Related Users:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {topic.related_users.slice(0, 5).map((userId, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {userId.replace('u-', '@')}
                                </Badge>
                              ))}
                              {topic.related_users.length > 5 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{topic.related_users.length - 5}
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                        {topic.related_articles && topic.related_articles.length > 0 && (
                          <div>
                            <span className="text-xs text-muted-foreground">Articles:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {topic.related_articles.map((articleId, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {articleId}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Users Tab */}
            <TabsContent value="users">
              {users.length === 0 && isLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <RefreshCwIcon className="h-8 w-8 mx-auto mb-4 animate-spin" />
                  <p>Generating user profiles...</p>
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pr-4">
                    {users.map((user, idx) => (
                      <Card key={idx} className={isLoading && idx === users.length - 1 ? 'animate-pulse' : ''}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-lg font-bold">
                                {user.handle?.[0]?.toUpperCase() || '?'}
                              </div>
                              <div>
                                <CardTitle className="text-base">{user.display_name}</CardTitle>
                                <p className="text-xs text-muted-foreground">@{user.handle}</p>
                              </div>
                            </div>
                            {user.activity_level && (
                              <div className="flex items-center gap-1">
                                <div className={`w-2 h-2 rounded-full ${getActivityColor(user.activity_level)}`} />
                                <span className="text-xs text-muted-foreground">{user.activity_level}</span>
                              </div>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {user.roles && user.roles.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {user.roles.map((role, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {role}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {user.bio_snippet && (
                            <p className="text-sm text-muted-foreground">{user.bio_snippet}</p>
                          )}
                          {user.tags && user.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {user.tags.map((tag, i) => (
                                <span key={i} className="text-xs text-primary">#{tag}</span>
                              ))}
                            </div>
                          )}
                          {user.stats && (
                            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                              <span>~{user.stats.approx_messages} messages</span>
                              {user.stats.primary_topics && (
                                <span>{user.stats.primary_topics.length} topics</span>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>

            {/* Articles Tab */}
            <TabsContent value="articles">
              {articles.length === 0 && isLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <RefreshCwIcon className="h-8 w-8 mx-auto mb-4 animate-spin" />
                  <p>Generating articles...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {articles.map((article, idx) => (
                    <Card key={idx} className={isLoading && idx === articles.length - 1 ? 'animate-pulse' : ''}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className={getCategoryColor(article.type || '')}>
                                {article.type}
                              </Badge>
                              {article.created_at && (
                                <span className="text-xs text-muted-foreground">
                                  {new Date(article.created_at).toLocaleDateString('de-DE')}
                                </span>
                              )}
                            </div>
                            <CardTitle className="text-xl">{article.title}</CardTitle>
                            {article.slug && (
                              <code className="text-xs text-muted-foreground mt-1 block">/{article.slug}</code>
                            )}
                          </div>
                          <code className="text-xs text-muted-foreground shrink-0">{article.id}</code>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {article.summary && (
                          <p className="text-muted-foreground">{article.summary}</p>
                        )}
                        <div className="flex flex-wrap gap-4 text-sm">
                          {article.related_topics && article.related_topics.length > 0 && (
                            <div>
                              <span className="text-muted-foreground">Topics: </span>
                              {article.related_topics.map((t, i) => (
                                <Badge key={i} variant="outline" className="ml-1 text-xs">
                                  {t}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {article.related_users && article.related_users.length > 0 && (
                            <div>
                              <span className="text-muted-foreground">Users: </span>
                              {article.related_users.slice(0, 5).map((u, i) => (
                                <Badge key={i} variant="secondary" className="ml-1 text-xs">
                                  {u.replace('u-', '@')}
                                </Badge>
                              ))}
                              {article.related_users.length > 5 && (
                                <span className="text-muted-foreground ml-1">
                                  +{article.related_users.length - 5}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {article.tags && article.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {article.tags.map((tag, i) => (
                              <span key={i} className="text-xs text-primary">#{tag}</span>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  )
}

