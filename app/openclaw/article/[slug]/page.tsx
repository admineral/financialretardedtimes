/**
 * OpenClaw Article Detail Page
 * 
 * Streams a full in-depth article about a specific theme from OpenClaw commits.
 * The theme comes from clicking "Read Full Article" on a brief news item or technical highlight.
 * Commits are fetched from the cache based on selectedDate and dayRange.
 * 
 * ROUTE: /openclaw/article/[slug]
 * 
 * SEARCH PARAMS:
 * - title: The theme title
 * - type: 'briefNews' | 'technicalHighlight' | 'leadStory'
 * - category: For technical highlights (optional)
 * - language: 'en' | 'de'
 * - dayRange: 1 | 3 | 7
 * - selectedDate: YYYY-MM-DD
 */

'use client'

import React, { useEffect, useRef, useState, use, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { 
  ArrowLeft, 
  Clock, 
  Users, 
  GitCommit, 
  GitBranch,
  RefreshCw, 
  Loader2,
  TrendingUp,
  Zap,
  ChevronRight,
  ExternalLink,
  Sparkles,
} from 'lucide-react'
import { OpenClawExpandedArticleSchema, type OpenClawExpandedArticleData } from '../../lib/schemas'
import { CONFIG } from '../../lib/config'
import { getCachedCommits, type CachedCommit } from '../../actions/cache'

function StreamingCursor({ show }: { show: boolean }) {
  if (!show) return null
  return <span className="inline-block w-0.5 h-[1em] bg-primary animate-pulse ml-1 align-middle" />
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-muted/50 rounded ${className}`} />
}

function ArticleSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-10 sm:h-12 w-full" />
        <Skeleton className="h-10 sm:h-12 w-3/4" />
      </div>
      <Skeleton className="h-7 w-full" />
      <div className="flex flex-wrap items-center gap-4 p-4 bg-muted/30 border border-foreground/10 rounded-lg">
        <Skeleton className="h-8 w-24 rounded" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-4/5" />
      </div>
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
    </div>
  )
}

function getSentimentStyle(sentiment: string) {
  switch (sentiment) {
    case 'momentum':
      return { bg: 'bg-green-500/10', text: 'text-green-500', label: '🚀 Momentum', border: 'border-green-500/30' }
    case 'stability':
      return { bg: 'bg-blue-500/10', text: 'text-blue-500', label: '🛡️ Stability', border: 'border-blue-500/30' }
    case 'exploration':
      return { bg: 'bg-purple-500/10', text: 'text-purple-500', label: '🔬 Exploration', border: 'border-purple-500/30' }
    case 'maintenance':
      return { bg: 'bg-amber-500/10', text: 'text-amber-500', label: '🔧 Maintenance', border: 'border-amber-500/30' }
    default:
      return { bg: 'bg-muted', text: 'text-muted-foreground', label: sentiment, border: 'border-muted' }
  }
}

function ArticleContent({ params }: { params: Promise<{ slug: string }> }) {
  use(params)
  const searchParams = useSearchParams()
  
  const title = searchParams.get('title') || ''
  const themeType = searchParams.get('type') || 'general'
  const category = searchParams.get('category') || ''
  const language = (searchParams.get('language') || 'en') as 'en' | 'de'
  const dayRange = parseInt(searchParams.get('dayRange') || '1', 10)
  const selectedDate = searchParams.get('selectedDate') || new Date().toISOString().split('T')[0]
  
  const [commits, setCommits] = useState<CachedCommit[]>([])
  const [isLoadingCommits, setIsLoadingCommits] = useState(true)
  
  const {
    object: articleData,
    submit,
    isLoading,
    error,
  } = useObject({
    api: '/openclaw/api/expand-article',
    schema: OpenClawExpandedArticleSchema,
  })
  
  const data = articleData as Partial<OpenClawExpandedArticleData> | undefined
  
  const hasSubmittedRef = useRef(false)
  
  // Fetch commits from cache
  useEffect(() => {
    async function loadCommits() {
      setIsLoadingCommits(true)
      try {
        // Calculate date range
        const dates: string[] = [selectedDate]
        if (dayRange > 1) {
          const startDate = new Date(selectedDate)
          for (let i = 1; i < dayRange; i++) {
            const prevDate = new Date(startDate)
            prevDate.setDate(prevDate.getDate() - i)
            dates.push(prevDate.toISOString().split('T')[0])
          }
        }
        
        const startDateStr = dates[dates.length - 1]
        const endDateStr = dates[0]
        
        const cachedCommits = await getCachedCommits({
          startDate: startDateStr,
          endDate: endDateStr,
        })
        
        setCommits(cachedCommits)
      } catch (err) {
        console.error('Failed to load commits:', err)
      } finally {
        setIsLoadingCommits(false)
      }
    }
    
    loadCommits()
  }, [selectedDate, dayRange])
  
  // Submit to AI once commits are loaded
  useEffect(() => {
    if (!hasSubmittedRef.current && title && commits.length > 0 && !isLoadingCommits) {
      hasSubmittedRef.current = true
      submit({
        theme: { title },
        themeType,
        commits: commits.map(c => ({
          sha: c.sha,
          message: c.message,
          author: { name: c.author.name, username: c.author.username },
          date: c.date,
          isMerge: c.isMerge,
        })),
        language,
        dayRange,
        selectedDate,
      })
    }
  }, [title, commits, isLoadingCommits, submit, themeType, language, dayRange, selectedDate])
  
  const handleRegenerate = () => {
    submit({
      theme: { title },
      themeType,
      commits: commits.map(c => ({
        sha: c.sha,
        message: c.message,
        author: { name: c.author.name, username: c.author.username },
        date: c.date,
        isMerge: c.isMerge,
      })),
      language,
      dayRange,
      selectedDate,
    })
  }
  
  const displayDate = new Date(selectedDate).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  
  const strings = language === 'de' ? {
    back: '← Zurück zu OpenClaw Today',
    generating: 'Artikel wird generiert...',
    commits: 'Commits',
    contributors: 'Beteiligte',
    trendAnalysis: 'Trend-Analyse',
    pattern: 'Muster',
    significance: 'Bedeutung',
    relatedAreas: 'Betroffene Bereiche',
    technicalDeepDive: 'Technischer Deep Dive',
    whatChanged: 'Was sich geändert hat',
    whyItMatters: 'Warum es wichtig ist',
    architectureNotes: 'Architektur-Notizen',
    keyTakeaways: 'Key Takeaways',
    outlook: 'Ausblick',
    relatedTopics: 'Verwandte Themen',
    regenerate: 'Artikel neu generieren',
    error: 'Fehler beim Generieren',
    retry: 'Erneut versuchen',
  } : {
    back: '← Back to OpenClaw Today',
    generating: 'Generating article...',
    commits: 'Commits',
    contributors: 'Contributors',
    trendAnalysis: 'Trend Analysis',
    pattern: 'Pattern',
    significance: 'Significance',
    relatedAreas: 'Related Areas',
    technicalDeepDive: 'Technical Deep Dive',
    whatChanged: 'What Changed',
    whyItMatters: 'Why It Matters',
    architectureNotes: 'Architecture Notes',
    keyTakeaways: 'Key Takeaways',
    outlook: 'Outlook',
    relatedTopics: 'Related Topics',
    regenerate: 'Regenerate Article',
    error: 'Error generating article',
    retry: 'Try again',
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Top Bar */}
      <div className="w-full border-b border-primary/10 py-2 bg-card/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex justify-between items-center text-xs text-muted-foreground">
          <Link 
            href="/openclaw" 
            className="flex items-center gap-2 hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            <span>{strings.back}</span>
          </Link>
          <div className="flex items-center gap-4">
            {(isLoadingCommits || isLoading) && (
              <span className="flex items-center gap-1.5 text-primary">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span className="hidden sm:inline">
                  {isLoadingCommits ? (language === 'de' ? 'Lade Commits...' : 'Loading commits...') : strings.generating}
                </span>
              </span>
            )}
            <a
              href={CONFIG.repo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-primary transition-colors"
            >
              <GitBranch className="h-3 w-3" />
              <span className="hidden sm:inline">{CONFIG.repo.fullName}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Masthead */}
      <header className="w-full py-6 border-b border-primary/20 bg-gradient-to-b from-card/50 to-transparent">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <Link href="/openclaw" className="inline-block">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-2xl">{CONFIG.newspaper.emoji}</span>
              <h1 className="font-masthead text-2xl sm:text-3xl md:text-4xl tracking-wide gold-text hover:opacity-80 transition-opacity">
                {CONFIG.newspaper.title}
              </h1>
            </div>
          </Link>
          <p className="text-xs text-muted-foreground tracking-[0.15em] uppercase">
            {CONFIG.newspaper.subtitle}
          </p>
        </div>
      </header>

      {/* Article Content */}
      <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Meta Info */}
        <div className="flex flex-wrap items-center gap-3 mb-6 text-sm">
          {category && (
            <span className="px-2 py-1 text-xs font-semibold rounded bg-primary/10 border border-primary/20 text-primary">
              {category}
            </span>
          )}
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {displayDate}
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <GitCommit className="h-3.5 w-3.5" />
            {commits.length} {strings.commits}
          </span>
        </div>

        {/* Show skeleton when loading commits or generating and no data yet */}
        {(isLoadingCommits || isLoading) && !data?.title && (
          <ArticleSkeleton />
        )}

        {/* Title */}
        {(data?.title || !isLoading) && (
          <h1 className="font-masthead text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-4 gold-text">
            {data?.title || title}
            <StreamingCursor show={isLoading && !data?.subtitle} />
          </h1>
        )}

        {/* Subtitle */}
        {(data?.subtitle || data?.title) && (
          <p className="text-xl sm:text-2xl text-muted-foreground font-headline mb-8">
            {data?.subtitle}
            <StreamingCursor show={isLoading && !!data?.subtitle && !data?.introduction} />
          </p>
        )}

        {/* Sentiment & Stats Bar */}
        {(data?.sentiment || data?.contributorInsights) && (
          <div className="flex flex-wrap items-center gap-4 mb-8 p-4 glass-card rounded-lg">
            {data?.sentiment && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded ${getSentimentStyle(data.sentiment).bg} border ${getSentimentStyle(data.sentiment).border}`}>
                <span className={`text-sm font-medium ${getSentimentStyle(data.sentiment).text}`}>
                  {getSentimentStyle(data.sentiment).label}
                </span>
              </div>
            )}
            {data?.contributorInsights && data.contributorInsights.filter(u => u?.username).length > 0 && (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-wrap gap-1.5">
                  {data.contributorInsights.filter(u => u?.username).map((user, idx) => (
                    <span 
                      key={idx}
                      className="px-2 py-0.5 bg-card text-xs rounded border border-primary/10 font-mono"
                      title={user.role || ''}
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
        {data?.introduction && (
          <div className="prose prose-lg dark:prose-invert max-w-none mb-10">
            <p className="text-lg leading-relaxed font-body first-letter:text-4xl first-letter:font-masthead first-letter:gold-text first-letter:mr-1 first-letter:float-left">
              {data.introduction}
              <StreamingCursor show={isLoading && !!data?.introduction && (!data?.sections || data.sections.length === 0)} />
            </p>
          </div>
        )}

        {/* Main Sections */}
        {data?.sections && data.sections.filter(s => s?.heading).length > 0 && (
          <div className="space-y-10 mb-12">
            {data.sections.filter(s => s?.heading).map((section, idx) => (
              <section key={idx} className="border-l-2 border-primary/30 pl-6">
                <h2 className="font-headline text-xl sm:text-2xl font-bold mb-4 text-foreground">
                  {section.heading}
                </h2>
                <div className="prose dark:prose-invert max-w-none">
                  <p className="font-body leading-relaxed whitespace-pre-line text-muted-foreground">
                    {section.content}
                  </p>
                </div>
                
                {section.relatedCommits && section.relatedCommits.filter(c => c?.sha).length > 0 && (
                  <div className="mt-4 p-3 bg-card/50 rounded border border-primary/10">
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <GitCommit className="h-3 w-3" />
                      Related Commits
                    </p>
                    <div className="space-y-1">
                      {section.relatedCommits.filter(c => c?.sha).map((commit, cIdx) => (
                        <div key={cIdx} className="text-xs font-mono">
                          <span className="text-primary">{(commit.sha || '').substring(0, 7)}</span>
                          <span className="text-muted-foreground/70 mx-1">@{commit.author || ''}</span>
                          <span className="text-muted-foreground">{(commit.message || '').split('\n')[0]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

        {/* Trend Analysis */}
        {data?.trendAnalysis && (
          <div className="mb-10 glass-card-gold p-6 rounded-lg">
            <h3 className="font-headline text-lg font-bold mb-4 flex items-center gap-2 gold-text">
              <TrendingUp className="h-5 w-5" />
              {strings.trendAnalysis}
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{strings.pattern}</p>
                <p className="font-body">{data.trendAnalysis.pattern}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{strings.significance}</p>
                <p className="font-body text-muted-foreground">{data.trendAnalysis.significance}</p>
              </div>
              {data.trendAnalysis.relatedAreas && data.trendAnalysis.relatedAreas.filter(Boolean).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{strings.relatedAreas}</p>
                  <div className="flex flex-wrap gap-2">
                    {data.trendAnalysis.relatedAreas.filter(Boolean).map((area, idx) => (
                      <span key={idx} className="px-2 py-1 bg-primary/10 text-xs rounded-full border border-primary/20">
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Technical Deep Dive */}
        {data?.technicalDeepDive && (
          <div className="mb-10 glass-card p-6 rounded-lg">
            <h3 className="font-headline text-lg font-bold mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              {strings.technicalDeepDive}
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{strings.whatChanged}</p>
                <p className="font-body">{data.technicalDeepDive.whatChanged}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{strings.whyItMatters}</p>
                <p className="font-body text-muted-foreground">{data.technicalDeepDive.whyItMatters}</p>
              </div>
              {data.technicalDeepDive.architectureNotes && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{strings.architectureNotes}</p>
                  <p className="font-body text-muted-foreground">{data.technicalDeepDive.architectureNotes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Contributor Insights */}
        {data?.contributorInsights && data.contributorInsights.filter(c => c?.username).length > 0 && (
          <div className="mb-10">
            <h3 className="font-headline text-lg font-bold mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-500" />
              {strings.contributors}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.contributorInsights.filter(c => c?.username).map((contributor, idx) => (
                <div key={idx} className="glass-card p-4 rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                      {(contributor.username || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-mono text-sm font-semibold">@{contributor.username}</p>
                      <p className="text-xs text-muted-foreground">{contributor.role || ''} • {contributor.commitCount || 0} commits</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{contributor.contribution}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Key Takeaways */}
        {data?.keyTakeaways && data.keyTakeaways.filter(Boolean).length > 0 && (
          <div className="mb-10 p-6 bg-primary/5 border border-primary/20 rounded-lg">
            <h3 className="font-headline text-lg font-bold mb-4 flex items-center gap-2">
              <span className="text-primary">📌</span> {strings.keyTakeaways}
            </h3>
            <ul className="space-y-2">
              {data.keyTakeaways.filter(Boolean).map((takeaway, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <ChevronRight className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span className="font-body">{takeaway}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Outlook */}
        {data?.outlook && (
          <div className="mb-10 pt-8 border-t border-primary/20">
            <h3 className="font-headline text-lg font-bold mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-400" />
              {strings.outlook}
            </h3>
            <p className="font-body text-lg leading-relaxed text-muted-foreground">
              {data.outlook}
            </p>
          </div>
        )}

        {/* Related Topics */}
        {data?.relatedTopics && data.relatedTopics.filter(Boolean).length > 0 && (
          <div className="mb-10 pt-6 border-t border-foreground/10">
            <h4 className="text-sm font-headline uppercase tracking-wider text-muted-foreground mb-3">
              {strings.relatedTopics}
            </h4>
            <div className="flex flex-wrap gap-2">
              {data.relatedTopics.filter(Boolean).map((topic, idx) => (
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
            <p>{strings.error}: {error.message}</p>
            <button 
              onClick={handleRegenerate}
              className="mt-2 px-4 py-2 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 transition-colors"
            >
              {strings.retry}
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
              {strings.regenerate}
            </button>
          </div>
        )}
      </article>

      {/* Footer */}
      <footer className="w-full border-t border-primary/20 bg-card/50 mt-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 text-center text-xs text-muted-foreground">
          <p>{CONFIG.newspaper.title} • A Financial Retarded Times Publication • Powered by AI 🦞</p>
        </div>
      </footer>
    </main>
  )
}

function ArticleLoading() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading article...</p>
      </div>
    </main>
  )
}

export default function OpenClawArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<ArticleLoading />}>
      <ArticleContent params={params} />
    </Suspense>
  )
}
