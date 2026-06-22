/**
 * page.tsx (Newspaper Landing Page)
 * 
 * REDESIGNED: Premium Dark Edition
 * A dramatic, cinematic newspaper experience with gold accents
 * 
 * Features:
 * - Live BTC ticker with animated price display
 * - Glassmorphism cards with depth
 * - Gold accent color scheme
 * - Staggered reveal animations
 * - Responsive newspaper grid
 */

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { SparklesIcon, TrendingUp, TrendingDown, Zap, Newspaper, RefreshCwIcon, ExternalLink, Clock3, MessageSquare, Users, Layers } from 'lucide-react'
import { track } from '@vercel/analytics'
import { ThemeSwitcher } from '@/components/theme-switcher'
import {
  NewspaperContent,
  NewspaperSidebar,
  ShortNewsSidebar,
  DateTimeline,
  ChatSection,
  NewspaperTimeline,
  AvatarProvider,
  NewspaperIssueProvider,
} from './components'
import { ChatHistoryTimeline } from '@/app/test-timeline/components'
import { FearGreedDisplay } from '@/app/test-fg/components'
import { ChartTimelineWidget, SentimentWidget } from '@/app/chart-timeline/components'
import { PredictionWidget } from '@/app/prediction/components'
import { LeaderboardWidget } from '@/app/chart-leader/components'
import { ChatTicker } from '@/app/components/ChatTicker'
import type { DayRange } from './components/DateTimeline'
import type { DateStats } from './lib/types'
import type { NewspaperAIUsage } from './engine'

interface BTCData {
  price: number
  change24h: number
  change7d: number
  change30d: number
  high24h: number
  low24h: number
  ath: number
  cachedAt: number
}

interface CachedDateBootstrap {
  date: string
  messageCount: number
  uniqueUsers: number
}

function CurrentDate({ cacheUpdatedAt }: { cacheUpdatedAt?: string }) {
  const [date, setDate] = useState<string>('')
  const [time, setTime] = useState<string>('')
  const [ago, setAgo] = useState<string>('')
  
  useEffect(() => {
    // Use cache timestamp if available, otherwise current date
    const dateToUse = cacheUpdatedAt ? new Date(cacheUpdatedAt) : new Date()
    setDate(dateToUse.toLocaleDateString('de-DE', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }))
    setTime(dateToUse.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit'
    }))
    
    // Calculate ago
    if (cacheUpdatedAt) {
      const updateAgo = () => {
        const now = new Date()
        const diffMs = now.getTime() - dateToUse.getTime()
        const diffMins = Math.floor(diffMs / 60000)
        const diffHours = Math.floor(diffMins / 60)
        const diffDays = Math.floor(diffHours / 24)
        
        if (diffMins < 1) setAgo('just now')
        else if (diffMins < 60) setAgo(`${diffMins}m ago`)
        else if (diffHours < 24) setAgo(`${diffHours}h ago`)
        else setAgo(`${diffDays}d ago`)
      }
      updateAgo()
      const interval = setInterval(updateAgo, 60000)
      return () => clearInterval(interval)
    }
  }, [cacheUpdatedAt])
  
  return (
    <span className="text-muted-foreground">
      {date || '...'}{time && `, ${time}`}{ago && ` (${ago})`}
    </span>
  )
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

function formatIssueTimestamp(dateString: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(dateString))
}

function formatIssueDateRange(selectedDates: string[]): string {
  if (selectedDates.length === 0) return ''

  const sortedDates = [...selectedDates].sort()
  const formatDate = (date: string) => new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: 'short'
  }).format(new Date(`${date}T12:00:00`))

  if (sortedDates.length === 1) return formatDate(sortedDates[0])
  return `${formatDate(sortedDates[0])} - ${formatDate(sortedDates[sortedDates.length - 1])}`
}

function formatTokenCount(value: number | null | undefined): string {
  return typeof value === 'number' ? value.toLocaleString('de-DE') : 'n/a'
}

function IssueMetaStrip({
  cacheInfo,
  dayRange,
  selectedDates,
  aiUsage
}: {
  cacheInfo: {
    updatedAt: string
    messageCount: number
    uniqueUsers: number
  } | null
  dayRange: DayRange
  selectedDates: string[]
  aiUsage?: NewspaperAIUsage | null
}) {
  if (!cacheInfo && !aiUsage) return null
  if (dayRange === 1 && !aiUsage) return null

  const issueLabel = selectedDates.length && selectedDates.length !== dayRange
    ? `${selectedDates.length}/${dayRange}D-Ausgabe`
    : dayRange === 1 ? 'AI Usage' : `${dayRange}D-Ausgabe`

  return (
    <div className="mb-8 flex flex-col gap-3 border-y border-primary/10 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="font-headline text-[11px] uppercase tracking-[0.18em] text-primary/80">
          {issueLabel}
        </span>
        <span className="hidden h-px w-12 bg-gradient-to-r from-primary/40 to-transparent sm:block" />
        {dayRange !== 1 && (
          <span className="truncate text-xs text-muted-foreground">
            {formatIssueDateRange(selectedDates)}
          </span>
        )}
        {aiUsage?.modelId && (
          <span className="truncate text-xs font-mono text-muted-foreground/70">
            {aiUsage.modelId}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {cacheInfo && (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-primary/20 bg-card/60 px-2.5 py-1 text-[11px] font-mono text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5 text-primary/70" />
              {formatIssueTimestamp(cacheInfo.updatedAt)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-primary/20 bg-card/60 px-2.5 py-1 text-[11px] font-mono text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5 text-primary/70" />
              {cacheInfo.messageCount.toLocaleString('de-DE')}
              <span className="font-body text-[10px] uppercase tracking-wider text-muted-foreground/60">Msgs</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-primary/20 bg-card/60 px-2.5 py-1 text-[11px] font-mono text-muted-foreground">
              <Users className="h-3.5 w-3.5 text-primary/70" />
              {cacheInfo.uniqueUsers.toLocaleString('de-DE')}
              <span className="font-body text-[10px] uppercase tracking-wider text-muted-foreground/60">User</span>
            </span>
          </>
        )}
        {aiUsage && (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-primary/20 bg-card/60 px-2.5 py-1 text-[11px] font-mono text-muted-foreground">
              {formatTokenCount(aiUsage.inputTokens)}
              <span className="font-body text-[10px] uppercase tracking-wider text-muted-foreground/60">In</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-primary/20 bg-card/60 px-2.5 py-1 text-[11px] font-mono text-muted-foreground">
              {formatTokenCount(aiUsage.outputTokens)}
              <span className="font-body text-[10px] uppercase tracking-wider text-muted-foreground/60">Out</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-primary/20 bg-card/60 px-2.5 py-1 text-[11px] font-mono text-primary">
              {formatTokenCount(aiUsage.totalTokens)}
              <span className="font-body text-[10px] uppercase tracking-wider text-muted-foreground/60">Total</span>
            </span>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Animated BTC Price Display
 */
function BTCPriceTicker({ btcData }: { btcData: BTCData | null }) {
  if (!btcData) {
    return (
      <div className="flex items-center gap-3 animate-pulse">
        <div className="w-24 h-8 bg-muted/50 rounded" />
        <div className="w-16 h-6 bg-muted/50 rounded" />
      </div>
    )
  }

  const isPositive = btcData.change24h >= 0

  return (
    <div className="flex items-center gap-4">
      {/* Main Price */}
      <div className="flex items-center gap-2">
        <span className="text-2xl sm:text-3xl font-bold gold-text font-mono tracking-tight">
          ${btcData.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </span>
        <div className={`flex items-center gap-1 px-2 py-1 rounded text-sm font-mono font-semibold ${
          isPositive 
            ? 'bg-emerald-500/20 text-emerald-400' 
            : 'bg-red-500/20 text-red-400'
        }`}>
          {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          {isPositive ? '+' : ''}{btcData.change24h.toFixed(2)}%
        </div>
      </div>
      
      {/* Extended Stats */}
      <div className="hidden lg:flex items-center gap-3 text-xs font-mono text-muted-foreground border-l border-primary/20 pl-4">
        <span className={btcData.change7d >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}>
          7d: {btcData.change7d >= 0 ? '+' : ''}{btcData.change7d.toFixed(1)}%
        </span>
        <span className={btcData.change30d >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}>
          30d: {btcData.change30d >= 0 ? '+' : ''}{btcData.change30d.toFixed(1)}%
        </span>
        <span className="text-muted-foreground/60">
          ATH: ${btcData.ath.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </span>
      </div>
    </div>
  )
}

export default function NewspaperPage() {
  const [availableDates, setAvailableDates] = useState<DateStats[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [dayRange, setDayRange] = useState<DayRange>(1)
  const [isLoadingDates, setIsLoadingDates] = useState(true)
  const [cumulativeUsers, setCumulativeUsers] = useState<Record<number, number> | undefined>(undefined)
  const [btcData, setBtcData] = useState<BTCData | null>(null)
  const userSelectedDateRef = useRef(false)

  useEffect(() => {
    track('newspaper_page_view', { source: 'direct' })
  }, [])

  useEffect(() => {
    const fetchBTC = async () => {
      try {
        const response = await fetch('/newspaper/api/btc-price')
        if (response.ok) {
          const data = await response.json()
          if (!data.error) setBtcData(data)
        }
      } catch (err) {
        console.error('Failed to fetch BTC data:', err)
      }
    }
    fetchBTC()
    const interval = setInterval(fetchBTC, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const bootstrapLatestCachedDate = async () => {
      try {
        const response = await fetch('/newspaper/api/cache-list?dayRange=1&limit=1', {
          cache: 'no-store'
        })
        if (!response.ok) return

        const data: { dates?: CachedDateBootstrap[] } = await response.json()
        const latest = data.dates?.[0]
        if (!latest) return

        setAvailableDates(prev => prev.length > 0 ? prev : [{
          date: latest.date,
          messageCount: latest.messageCount,
          uniqueUsers: latest.uniqueUsers
        }])
        setSelectedDate(prev => prev || latest.date)
        setSelectedDates(prev => prev.length > 0 ? prev : [latest.date])
      } catch (err) {
        console.error('Failed to bootstrap latest cached newspaper:', err)
      }
    }

    bootstrapLatestCachedDate()
  }, [])

  useEffect(() => {
    const fetchDates = async () => {
      try {
        const response = await fetch('/newspaper/api/available-dates')
        if (response.ok) {
          const data = await response.json()
          setAvailableDates(data.dates || [])
          if (data.cumulativeUsers) setCumulativeUsers(data.cumulativeUsers)
          if (data.dates && data.dates.length > 0) {
            const latestDate = data.dates[0].date
            if (!userSelectedDateRef.current) {
              setSelectedDate(latestDate)
              setSelectedDates([latestDate])
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch available dates:', err)
      } finally {
        setIsLoadingDates(false)
      }
    }
    fetchDates()
  }, [])

  const handleDateSelect = useCallback((date: string) => {
    userSelectedDateRef.current = true
    setSelectedDate(date)
    if (dayRange === 1) setSelectedDates([date])
    track('newspaper_date_select', { date, dayRange, source: 'timeline' })
  }, [dayRange])
  
  const handleDayRangeChange = useCallback((days: DayRange, dates: string[]) => {
    setDayRange(days)
    setSelectedDates(dates)
    track('newspaper_day_range_change', { dayRange: days, datesCount: dates.length })
  }, [])

  return (
    <AvatarProvider>
      <NewspaperIssueProvider
        selectedDate={selectedDate}
        selectedDates={selectedDates}
        dayRange={dayRange}
      >
      {(issueState) => {
        const issue = issueState.issue
        const isIssueInitialLoading = issueState.isLoading && !issue
        const isIssueStreaming = issueState.isRefreshing
        const isIssueBusy = isIssueInitialLoading || isIssueStreaming
        const isFearGreedRefreshing = issueState.refreshingModule === 'sentiment.fearGreed'
        const isTraderLeaderboardRefreshing = issueState.refreshingModule === 'trading.traderLeaderboard'
        const newspaperData = issue?.modules.articleDigest.data ?? undefined
        const issueCacheInfo = issueState.isRefreshing ? null : issueState.cacheInfo
        const issueAIUsage = issueState.isRefreshing ? null : issue?.resources.aiUsage ?? null
        const fearGreedCacheInfo = issue
          ? {
              updatedAt: issue.meta.updatedAt,
              isFromToday: true,
              isStale: !issue.meta.isFresh,
              dateRange: issue.modules.fearGreed.dateRange ?? undefined
            }
          : null
        const handleRefresh = () => {
          void issueState.refreshIssue()
          track('newspaper_refresh', { selectedDate: selectedDate || 'none', dayRange })
        }
        const handleFearGreedRefresh = () => {
          void issueState.refreshModule('sentiment.fearGreed')
          track('newspaper_module_refresh', {
            moduleId: 'sentiment.fearGreed',
            selectedDate: selectedDate || 'none',
            dayRange
          })
        }
        const handleTraderLeaderboardRefresh = () => {
          void issueState.refreshModule('trading.traderLeaderboard')
          track('newspaper_module_refresh', {
            moduleId: 'trading.traderLeaderboard',
            selectedDate: selectedDate || 'none',
            dayRange
          })
        }

        return (
      <main className="min-h-screen bg-background relative">
        {/* Subtle gradient background - z-0 to stay behind content */}
        <div className="fixed inset-0 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none z-0" />
        
        {/* Hero Masthead Section */}
        <header className="relative border-b border-primary/20 z-10">
          {/* Top utility bar */}
          <div className="w-full border-b border-primary/10 bg-card/50 backdrop-blur-sm">
            <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-2 flex justify-between items-center">
              <div className="flex items-center gap-3 text-xs">
                <CurrentDate cacheUpdatedAt={issueCacheInfo?.updatedAt} />
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href="/newspaper/prompt-inspector"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-headline font-semibold uppercase tracking-wide border border-primary/30 text-primary/80 hover:text-primary hover:border-primary/60 hover:bg-primary/10 transition-all rounded-sm"
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Prompt</span>
                </Link>
                <Link
                  href="/openclaw"
                  onClick={() => track('newspaper_openclaw_click', { location: 'topbar' })}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-headline font-semibold uppercase tracking-wide border border-primary/30 text-primary/80 hover:text-primary hover:border-primary/60 hover:bg-primary/10 transition-all rounded-sm"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>OpenClaw</span>
                </Link>
                {isIssueBusy && (
                  <span className="flex items-center gap-1.5 text-xs text-primary animate-pulse">
                    <SparklesIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Kuratiere...</span>
                  </span>
                )}
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={handleRefresh}
                    disabled={isIssueBusy}
                    className="p-2 hover:bg-primary/10 rounded-full transition-all disabled:opacity-50"
                    aria-label="Aktualisieren"
                  >
                    <RefreshCwIcon className={`h-4 w-4 text-muted-foreground hover:text-primary transition-colors ${isIssueBusy ? 'animate-spin text-primary' : ''}`} />
                  </button>
                  {issueCacheInfo && !isIssueBusy && (
                    <span className="text-xs text-muted-foreground/70 font-mono">
                      {formatTimeAgo(issueCacheInfo.updatedAt)}
                    </span>
                  )}
                </div>
                <ThemeSwitcher />
              </div>
            </div>
          </div>
          <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
              {/* Title Section */}
              <div className="text-center lg:text-left">
                <Link href="/newspaper" className="inline-block group">
                  <div className="flex items-center justify-center lg:justify-start gap-3 mb-2">
                    <Newspaper className="w-8 h-8 text-primary opacity-60" />
                    <div className="h-px w-12 bg-gradient-to-r from-primary/60 to-transparent" />
                  </div>
                  <h1 className="font-masthead text-4xl sm:text-5xl md:text-6xl lg:text-7xl gold-text tracking-wide transition-all duration-300 group-hover:tracking-wider">
                    Financial Retarded Times
                  </h1>
                </Link>
                <div className="flex items-center justify-center lg:justify-start gap-4 mt-3">
                  <p className="text-xs sm:text-sm tracking-[0.2em] uppercase text-muted-foreground/60 font-headline">
                    Community Edition
                  </p>
                  <span className="text-primary/40">•</span>
                  <p className="text-xs sm:text-sm tracking-[0.15em] uppercase text-muted-foreground/60 font-headline">
                    Chat-Highlights & Analysen
                  </p>
                </div>
              </div>

              {/* BTC Price Section */}
              <div className="flex justify-center lg:justify-end">
                <div className="glass-card-gold px-6 py-4 rounded-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">₿</span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Bitcoin</span>
                    {btcData?.cachedAt && (
                      <span className="text-[10px] text-muted-foreground/40 font-mono ml-auto">
                        {new Date(btcData.cachedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    <span className={`w-2 h-2 rounded-full bg-emerald-500 animate-pulse ${!btcData?.cachedAt ? 'ml-auto' : ''}`} />
                  </div>
                  <BTCPriceTicker btcData={btcData} />
                </div>
              </div>
            </div>
          </div>

          {/* Golden rule */}
          <div className="newspaper-rule-gold" />
        </header>

        {/* Date Navigation - Sticky */}
        <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-primary/10">
          <DateTimeline 
            availableDates={availableDates}
            selectedDate={selectedDate}
            isLoadingDates={isLoadingDates}
            isLoading={isIssueBusy}
            onDateSelect={handleDateSelect}
            onDayRangeChange={handleDayRangeChange}
            onRefresh={handleRefresh}
            cumulativeUsers={cumulativeUsers}
          />
        </div>

        {/* Live Chat Ticker - Breaking News Style */}
        {dayRange === 1 && (
          <div className="w-full border-b border-primary/20 bg-gradient-to-r from-card via-card/95 to-card relative z-10">
            <ChatTicker
              speed="normal"
              autoStart
              className="newspaper-ticker"
              eventsOverride={issue?.modules.tickerBanner.events ?? []}
              cacheInfoOverride={issueCacheInfo ? { updatedAt: issueCacheInfo.updatedAt, stale: !issueCacheInfo.isFresh } : null}
              isLoadingOverride={isIssueInitialLoading}
              disableAutoFetch
            />
          </div>
        )}

        {/* Chat Activity Timeline with Fear & Greed - Always visible for dayRange 1 */}
        {dayRange === 1 && (
          <div className="w-full border-b border-primary/10 bg-card/30 relative z-20">
            <div className="flex items-stretch">
              {/* Timeline - takes most of the width, mini mode with hover expand */}
              <div className="flex-1 min-w-0">
                <ChatHistoryTimeline
                  autoStart
                  mini
                  defaultMode="24h"
                  showRefreshButton={false}
                  controlledEvents={issue?.modules.expandingTimeline.events ?? []}
                  controlledActivityBuckets={issue?.modules.expandingTimeline.activityBuckets ?? []}
                  controlledActivityStats={issue?.modules.expandingTimeline.activityStats ?? null}
                  controlledCacheInfo={issueCacheInfo ? {
                    updatedAt: issueCacheInfo.updatedAt,
                    summary: issue?.modules.expandingTimeline.summary ?? undefined,
                    activityLevel: issue?.modules.expandingTimeline.activityLevel ?? undefined
                  } : null}
                  disableAutoFetch
                />
              </div>
              
              {/* Fear & Greed Widget - compact version on the right */}
              <div className="hidden lg:flex items-center border-l border-primary/10 px-4 bg-card/50">
                <FearGreedDisplay
                  compact
                  data={issue?.modules.fearGreed.data ?? null}
                  cacheInfo={fearGreedCacheInfo}
                  isLoading={isIssueInitialLoading || isFearGreedRefreshing}
                  hasData={Boolean(issue?.modules.fearGreed.data)}
                  refresh={handleFearGreedRefresh}
                />
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            
            {/* Left Sidebar - Contributors & Topics */}
            <aside className="lg:col-span-2 hidden lg:block">
              <div className="sticky top-24">
                <NewspaperSidebar 
                  data={newspaperData} 
                  isLoading={isIssueInitialLoading}
                  selectedDate={selectedDate}
                  selectedDates={selectedDates}
                />
              </div>
            </aside>

            {/* Main Content Column */}
            <main className="lg:col-span-7">
              {/* Section Header */}
              <div className="mb-3 flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  <h2 className="font-headline text-lg uppercase tracking-wider text-foreground">
                    Tages-Highlights
                  </h2>
                </div>
                <div className="flex-1 h-px bg-gradient-to-r from-primary/40 to-transparent" />
              </div>
              <IssueMetaStrip
                cacheInfo={issueCacheInfo}
                dayRange={dayRange}
                selectedDates={selectedDates}
                aiUsage={issueAIUsage}
              />

              {/* AI-Generated Content */}
              <NewspaperContent 
                selectedDate={selectedDate}
                selectedDates={selectedDates}
                dayRange={dayRange}
                dataOverride={newspaperData}
                isLoadingOverride={isIssueBusy}
                disableAutoFetch
              />

              {!isIssueInitialLoading && (
                <LeaderboardWidget
                  embedded
                  dataOverride={issue?.modules.traderLeaderboard?.data ?? null}
                  isLoadingOverride={issue?.modules.traderLeaderboard?.data ? isTraderLeaderboardRefreshing : undefined}
                  disableAutoFetch={Boolean(issue?.modules.traderLeaderboard?.data)}
                  refresh={issue?.modules.traderLeaderboard?.data ? handleTraderLeaderboardRefresh : undefined}
                  isRefreshing={isTraderLeaderboardRefreshing}
                />
              )}
            </main>

            {/* Right Sidebar */}
            <aside className="lg:col-span-3">
              <div className="sticky top-24 space-y-6">
                {/* Fear & Greed Index */}
                <div className="glass-card-gold p-5 rounded-sm">
                  <FearGreedDisplay
                    data={issue?.modules.fearGreed.data ?? null}
                    cacheInfo={fearGreedCacheInfo}
                    isLoading={isIssueInitialLoading || isFearGreedRefreshing}
                    hasData={Boolean(issue?.modules.fearGreed.data)}
                    refresh={handleFearGreedRefresh}
                  />
                </div>

                {/* Short News */}
                <ShortNewsSidebar 
                  data={newspaperData} 
                  isLoading={isIssueInitialLoading} 
                />

                {/* Live Chat */}
                <ChatSection />

                {/* Newsletter Signup */}
                <div className="glass-card p-5 rounded-sm">
                  <h4 className="font-headline text-sm font-bold uppercase tracking-wider mb-3 gold-text">
                    Newsletter
                  </h4>
                  <p className="text-xs text-muted-foreground font-body mb-4 leading-relaxed">
                    Die wichtigsten Chat-Highlights direkt in Ihr Postfach. Täglich kuratiert.
                  </p>
                  <div className="flex gap-2">
                    <input 
                      type="email" 
                      placeholder="E-Mail Adresse" 
                      className="flex-1 px-3 py-2 text-xs font-body bg-background/50 border border-primary/20 focus:outline-none focus:border-primary/50 transition-colors rounded-sm"
                    />
                    <button 
                      onClick={() => track('newspaper_newsletter_click', { location: 'sidebar' })}
                      className="px-4 py-2 bg-primary text-primary-foreground text-xs font-headline font-semibold tracking-wide hover:bg-primary/90 transition-all rounded-sm hover:shadow-lg hover:shadow-primary/20"
                    >
                      OK
                    </button>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>

        {/* Chart Timeline Section */}
        {dayRange === 1 && !isIssueInitialLoading && (
          <section className="border-t border-primary/10 mt-8 bg-card/20 relative z-10">
            <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <ChartTimelineWidget autoStart showMinLineSlider />
            </div>
          </section>
        )}

        {/* Sentiment Section */}
        {dayRange === 1 && !isIssueInitialLoading && (
          <SentimentWidget />
        )}

        {/* Prediction Market Section */}
        {dayRange === 1 && !isIssueInitialLoading && (
          <PredictionWidget />
        )}

        {/* Older Editions Section */}
        {dayRange === 1 && !isIssueInitialLoading && (
          <section className="border-t-2 border-primary/20 mt-4 bg-card/30 relative z-10">
            <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
              {/* Section Header */}
              <div className="text-center mb-12">
                <div className="inline-flex items-center gap-4 mb-4">
                  <div className="w-16 h-px bg-gradient-to-r from-transparent to-primary/40" />
                  <Newspaper className="w-6 h-6 text-primary/60" />
                  <div className="w-16 h-px bg-gradient-to-l from-transparent to-primary/40" />
                </div>
                <h2 className="font-masthead text-3xl sm:text-4xl gold-text mb-3">
                  Ältere Ausgaben
                </h2>
                <p className="text-sm text-muted-foreground font-body max-w-md mx-auto">
                  Stöbern Sie durch die Archive vergangener Tage
                </p>
              </div>
              
              {/* Timeline */}
              <div className="max-w-5xl mx-auto">
                <NewspaperTimeline
                  currentDate={selectedDate}
                  refreshKey={issueCacheInfo?.updatedAt ?? null}
                />
              </div>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="border-t border-primary/20 bg-card/50 mt-auto relative z-10">
          <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Navigation Links */}
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 mb-6">
              <span className="text-xs text-muted-foreground/60 uppercase tracking-wider">Rubriken:</span>
              {['Diskussionen', 'Analysen', 'Meinungen', 'Highlights'].map((item) => (
                <span 
                  key={item}
                  onClick={() => track('newspaper_nav_click', { section: item.toLowerCase() })}
                  className="text-sm text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                >
                  {item}
                </span>
              ))}
              <span className="text-primary/20">|</span>
              <span className="text-xs text-muted-foreground/60 uppercase tracking-wider">Community:</span>
              <span 
                onClick={() => track('newspaper_nav_click', { section: 'top_beitragende' })}
                className="text-sm text-muted-foreground hover:text-primary cursor-pointer transition-colors"
              >
                Top Beitragende
              </span>
            </div>
            
            {/* Copyright */}
            <div className="text-center">
              <div className="inline-flex items-center gap-3 text-xs text-muted-foreground/50">
                <span>© 2024-2025 Financial Retarded Times</span>
                <span className="text-primary/30">•</span>
                <span className="italic">„Keine Finanzberatung – nur Entertainment“</span>
              </div>
            </div>
          </div>
        </footer>
      </main>
        )
      }}
      </NewspaperIssueProvider>
    </AvatarProvider>
  )
}
