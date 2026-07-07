/**
 * page.tsx (Newspaper Landing Page — edition v3)
 *
 * Block-based tri-edition newspaper: one mega generation produces the
 * 1D/3D/7D editions (articles, genui charts, ticker, timeline, shared
 * modules), all cached in the DB. Range and archive-day switching is
 * instant from cache; the noon-freshness rule triggers background
 * regeneration with live streaming into the page.
 */

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  SparklesIcon, TrendingUp, TrendingDown, Zap, Newspaper, RefreshCwIcon,
  ExternalLink, Clock3, MessageSquare, Users, Layers, Archive
} from 'lucide-react'
import { track } from '@vercel/analytics'
import { ThemeSwitcher } from '@/components/theme-switcher'
import {
  DateTimeline,
  ChatSection,
  NewspaperTimeline,
  AvatarProvider,
} from './components'
import {
  EditionProvider,
  EditionBlockList,
  EditionSidebar,
  streamingContentForRange,
} from './components/edition'
import type { EditionState } from './components/edition'
import { ChatHistoryTimeline } from '@/app/test-timeline/components'
import { FearGreedDisplay } from '@/app/test-fg/components'
import { ChartTimelineWidget, SentimentWidget, PredictionWidget, TraderLeaderboardWidget } from '@/components/market-widgets'
import { ChatTicker } from '@/app/components/ChatTicker'
import type { DayRange } from './components/DateTimeline'
import type { DateStats } from './lib/types'
import type { EditionWidgetId } from './edition/prompt'

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

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'gerade eben'
  if (diffMins < 60) return `vor ${diffMins}m`
  if (diffHours < 24) return `vor ${diffHours}h`
  return `vor ${diffDays}d`
}

function CurrentDate({ generatedAt }: { generatedAt?: string }) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    const dateToUse = generatedAt ? new Date(generatedAt) : new Date()
    const update = () => {
      const base = dateToUse.toLocaleDateString('de-DE', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      })
      const time = dateToUse.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      setLabel(generatedAt ? `${base}, ${time} (${formatTimeAgo(generatedAt)})` : `${base}, ${time}`)
    }
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [generatedAt])

  return <span className="text-muted-foreground">{label || '...'}</span>
}

function formatTokenCount(value: number | null | undefined): string {
  return typeof value === 'number' ? value.toLocaleString('de-DE') : 'n/a'
}

const RANGE_LABELS: Record<DayRange, string> = {
  1: 'Tagesausgabe',
  3: '3-Tage-Ausgabe',
  7: 'Wochenausgabe'
}

function EditionMetaStrip({
  state,
  dayRange
}: {
  state: EditionState
  dayRange: DayRange
}) {
  const { edition, cacheInfo, isLegacy } = state
  if (!edition && !cacheInfo) return null

  const aiUsage = edition?.meta.aiUsage ?? null

  return (
    <div className="mb-8 flex flex-col gap-3 border-y border-primary/10 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="font-headline text-[11px] uppercase tracking-[0.18em] text-primary/80">
          {RANGE_LABELS[dayRange]}
        </span>
        <span className="hidden h-px w-12 bg-gradient-to-r from-primary/40 to-transparent sm:block" />
        {edition?.content.masthead?.motto && (
          <span className="truncate text-xs italic text-muted-foreground font-body">
            &bdquo;{edition.content.masthead.motto}&ldquo;
          </span>
        )}
        {isLegacy && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-primary/25 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary/70">
            <Archive className="h-3 w-3" />
            Archiv-Format
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {cacheInfo && (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-primary/20 bg-card/60 px-2.5 py-1 text-[11px] font-mono text-muted-foreground" title={`Generiert: ${cacheInfo.generatedAt}`}>
              <Clock3 className="h-3.5 w-3.5 text-primary/70" />
              generiert {formatTimeAgo(cacheInfo.generatedAt)}
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
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-primary/20 bg-card/60 px-2.5 py-1 text-[11px] font-mono text-primary" title={`${formatTokenCount(aiUsage.inputTokens)} in / ${formatTokenCount(aiUsage.outputTokens)} out · ${aiUsage.modelId ?? ''}`}>
            {formatTokenCount(aiUsage.totalTokens)}
            <span className="font-body text-[10px] uppercase tracking-wider text-muted-foreground/60">Tokens</span>
          </span>
        )}
      </div>
    </div>
  )
}

function WidgetRefreshButton({
  widgetId,
  label,
  state
}: {
  widgetId: EditionWidgetId
  label: string
  state: EditionState
}) {
  const isActive = state.refreshingWidget === widgetId
  const disabled = Boolean(state.refreshingWidget) || state.isStreaming || !state.edition || state.isLegacy

  return (
    <button
      onClick={() => {
        void state.refreshWidget(widgetId)
        track('newspaper_widget_refresh', { widgetId })
      }}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-sm border border-primary/20 bg-card/60 px-2.5 py-1 text-[11px] font-headline uppercase tracking-wider text-muted-foreground transition-all hover:border-primary/50 hover:text-primary disabled:opacity-40"
      aria-label={`${label} aktualisieren`}
    >
      <RefreshCwIcon className={`h-3 w-3 ${isActive ? 'animate-spin text-primary' : ''}`} />
      {label}
    </button>
  )
}

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

const TIMELINE_MODES: Record<DayRange, '24h' | '3d' | '7d'> = { 1: '24h', 3: '3d', 7: '7d' }

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
        const response = await fetch('/newspaper/api/cache-list?dayRange=1&limit=1', { cache: 'no-store' })
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
      <EditionProvider selectedDate={selectedDate} dayRange={dayRange}>
        {(state) => {
          const edition = state.edition
          const isInitialLoading = state.isLoading && !edition
          const isBusy = isInitialLoading || state.isStreaming
          const streamingContent = streamingContentForRange(state.streamingObject, dayRange)
          const streamingBlocks = Array.isArray(streamingContent?.blocks) ? streamingContent.blocks : null

          // Per-edition ticker/timeline: prefer live streamed events, else cache.
          const streamedTicker = Array.isArray(streamingContent?.ticker?.events)
            ? streamingContent.ticker.events.filter((e): e is NonNullable<typeof e> => Boolean(e && typeof e === 'object' && 'text' in e && e.text))
            : null
          const tickerEvents = streamedTicker && streamedTicker.length > 0
            ? streamedTicker.map((event, index) => ({ id: `stream-ticker-${index}`, ...(event as object) })) as NonNullable<typeof edition>['content']['ticker']['events']
            : edition?.content.ticker.events ?? []

          const timelineEvents = edition?.content.timeline.events ?? []
          const activityBuckets = edition?.activity.buckets ?? []
          const activityStats = edition?.activity.stats ?? null

          const fearGreedData = edition?.shared.fearGreed.data ?? null
          const fearGreedCacheInfo = edition
            ? {
                updatedAt: edition.shared.fearGreed.updatedAt ?? edition.meta.updatedAt,
                isFromToday: true,
                isStale: !edition.meta.isFresh,
                dateRange: edition.shared.fearGreed.dateRange ?? undefined
              }
            : null

          const handleRefresh = () => {
            void state.generate()
            track('newspaper_refresh', { selectedDate: selectedDate || 'none', dayRange })
          }
          const handleFearGreedRefresh = () => {
            void state.refreshWidget('fearGreed')
            track('newspaper_widget_refresh', { widgetId: 'fearGreed' })
          }

          return (
            <main className="min-h-screen bg-background relative">
              <div className="fixed inset-0 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none z-0" />

              {/* Hero Masthead Section */}
              <header className="relative border-b border-primary/20 z-10">
                <div className="w-full border-b border-primary/10 bg-card/50 backdrop-blur-sm">
                  <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-2 flex justify-between items-center">
                    <div className="flex items-center gap-3 text-xs">
                      <CurrentDate generatedAt={state.cacheInfo?.generatedAt} />
                    </div>
                    <div className="flex items-center gap-3">
                      <Link
                        href="/newspaper/v2"
                        onClick={() => track('newspaper_v2_click', { location: 'topbar' })}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-headline font-semibold uppercase tracking-wide border border-primary/30 text-primary/80 hover:text-primary hover:border-primary/60 hover:bg-primary/10 transition-all rounded-sm"
                      >
                        <Newspaper className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Monatsausgabe</span>
                        <span className="sm:hidden">v2</span>
                      </Link>
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
                      {isBusy && (
                        <span className="flex items-center gap-1.5 text-xs text-primary animate-pulse">
                          <SparklesIcon className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{state.isStreaming ? 'Druckt frische Ausgaben…' : 'Lade…'}</span>
                        </span>
                      )}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={handleRefresh}
                          disabled={isBusy}
                          className="p-2 hover:bg-primary/10 rounded-full transition-all disabled:opacity-50"
                          aria-label="Alle Ausgaben neu generieren"
                          title="Alle drei Ausgaben neu generieren"
                        >
                          <RefreshCwIcon className={`h-4 w-4 text-muted-foreground hover:text-primary transition-colors ${isBusy ? 'animate-spin text-primary' : ''}`} />
                        </button>
                        {state.cacheInfo && !isBusy && (
                          <span className="text-xs text-muted-foreground/70 font-mono" title={`Generiert: ${state.cacheInfo.generatedAt}`}>
                            {formatTimeAgo(state.cacheInfo.generatedAt)}
                          </span>
                        )}
                      </div>
                      <ThemeSwitcher />
                    </div>
                  </div>
                </div>
                <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                  <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
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
                          {edition?.content.masthead?.dateline ?? 'Community Edition'}
                        </p>
                        <span className="text-primary/40">•</span>
                        <p className="text-xs sm:text-sm tracking-[0.15em] uppercase text-muted-foreground/60 font-headline">
                          Chat-Highlights & Analysen
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-center lg:justify-end">
                      <div className="glass-card-gold glass-grain px-6 py-4 rounded-sm">
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

                <div className="newspaper-rule-gold" />
              </header>

              {/* Date Navigation - Sticky */}
              <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-primary/10">
                <DateTimeline
                  availableDates={availableDates}
                  selectedDate={selectedDate}
                  isLoadingDates={isLoadingDates}
                  isLoading={isBusy}
                  onDateSelect={handleDateSelect}
                  onDayRangeChange={handleDayRangeChange}
                  onRefresh={handleRefresh}
                  cumulativeUsers={cumulativeUsers}
                />
              </div>

              {/* Ticker banner — per-edition version (24h/3d/7d from the same generation) */}
              <div className="w-full border-b border-primary/20 bg-gradient-to-r from-card via-card/95 to-card relative z-10">
                <ChatTicker
                  speed="normal"
                  autoStart
                  className="newspaper-ticker"
                  eventsOverride={tickerEvents}
                  cacheInfoOverride={state.cacheInfo ? { updatedAt: state.cacheInfo.updatedAt, stale: !state.cacheInfo.isFresh } : null}
                  isLoadingOverride={isInitialLoading}
                  disableAutoFetch
                />
              </div>

              {/* Activity timeline strip + Fear & Greed — per-edition version */}
              <div className="w-full border-b border-primary/10 bg-card/30 relative z-20">
                <div className="flex items-stretch">
                  <div className="flex-1 min-w-0">
                    <ChatHistoryTimeline
                      key={`timeline-${dayRange}`}
                      autoStart
                      mini
                      defaultMode={TIMELINE_MODES[dayRange]}
                      showRefreshButton={false}
                      controlledEvents={timelineEvents}
                      controlledActivityBuckets={activityBuckets}
                      controlledActivityStats={activityStats}
                      controlledCacheInfo={state.cacheInfo ? {
                        updatedAt: state.cacheInfo.updatedAt,
                        summary: edition?.content.timeline.summary ?? undefined,
                        activityLevel: edition?.content.timeline.activityLevel ?? undefined
                      } : null}
                      disableAutoFetch
                    />
                  </div>

                  <div className="hidden lg:flex items-center border-l border-primary/10 px-4 bg-card/50">
                    <FearGreedDisplay
                      compact
                      data={fearGreedData}
                      cacheInfo={fearGreedCacheInfo}
                      isLoading={isInitialLoading || state.refreshingWidget === 'fearGreed'}
                      hasData={Boolean(fearGreedData)}
                      refresh={handleFearGreedRefresh}
                    />
                  </div>
                </div>
              </div>

              {/* Main Content Area */}
              <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 relative z-10">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">

                  {/* Left Sidebar */}
                  <aside className="lg:col-span-2 hidden lg:block">
                    <div className="sticky top-24">
                      <EditionSidebar edition={edition} isLoading={isInitialLoading} />
                    </div>
                  </aside>

                  {/* Main Column — the block stream */}
                  <main className="lg:col-span-7">
                    <div className="mb-3 flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-primary" />
                        <h2 className="font-headline text-lg uppercase tracking-wider text-foreground">
                          {RANGE_LABELS[dayRange]}
                        </h2>
                      </div>
                      <div className="flex-1 h-px bg-gradient-to-r from-primary/40 to-transparent" />
                      <div className="flex items-center gap-1.5">
                        <WidgetRefreshButton widgetId="ticker" label="Ticker" state={state} />
                        <WidgetRefreshButton widgetId="timeline" label="Timeline" state={state} />
                        <WidgetRefreshButton widgetId="traderLeaderboard" label="Leaderboard" state={state} />
                      </div>
                    </div>

                    <EditionMetaStrip state={state} dayRange={dayRange} />

                    {state.error && (
                      <div className="mb-6 rounded-sm border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                        {state.error}
                      </div>
                    )}

                    <EditionBlockList
                      edition={edition}
                      dayRange={dayRange}
                      streamingBlocks={state.isStreaming && streamingBlocks ? streamingBlocks as never : undefined}
                    />
                  </main>

                  {/* Right Sidebar */}
                  <aside className="lg:col-span-3">
                    <div className="sticky top-24 space-y-6">
                      <div className="glass-card-gold glass-grain p-5 rounded-sm">
                        <FearGreedDisplay
                          data={fearGreedData}
                          cacheInfo={fearGreedCacheInfo}
                          isLoading={isInitialLoading || state.refreshingWidget === 'fearGreed'}
                          hasData={Boolean(fearGreedData)}
                          refresh={handleFearGreedRefresh}
                        />
                      </div>

                      <ChatSection />

                      <div className="glass-card glass-grain p-5 rounded-sm">
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

              {/* Below the fold: self-contained market widgets (their data feeds the main prompt) */}
              {!isInitialLoading && (
                <section className="border-t border-primary/10 mt-8 bg-card/20 relative z-10">
                  <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
                    <div className="text-center mb-10">
                      <div className="inline-flex items-center gap-4 mb-3">
                        <div className="w-16 h-px bg-gradient-to-r from-transparent to-primary/40" />
                        <TrendingUp className="w-5 h-5 text-primary/60" />
                        <div className="w-16 h-px bg-gradient-to-l from-transparent to-primary/40" />
                      </div>
                      <h2 className="font-masthead text-3xl sm:text-4xl gold-text mb-2">
                        Der Marktteil
                      </h2>
                      <p className="text-sm text-muted-foreground font-body max-w-md mx-auto">
                        Chart-Chronik, Stimmungsbarometer und Wettbüro — live aus dem Chat analysiert
                      </p>
                    </div>
                    <div className="space-y-8">
                      <ChartTimelineWidget />
                      <SentimentWidget />
                      <PredictionWidget />
                      <TraderLeaderboardWidget />
                    </div>
                  </div>
                </section>
              )}

              {/* Archive */}
              {!isInitialLoading && (
                <section className="border-t-2 border-primary/20 mt-4 bg-card/30 relative z-10">
                  <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
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

                    <div className="max-w-5xl mx-auto">
                      <NewspaperTimeline
                        currentDate={selectedDate}
                        refreshKey={state.cacheInfo?.updatedAt ?? null}
                      />
                    </div>
                  </div>
                </section>
              )}

              {/* Footer */}
              <footer className="border-t border-primary/20 bg-card/50 mt-auto relative z-10">
                <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

                  <div className="text-center">
                    <div className="inline-flex items-center gap-3 text-xs text-muted-foreground/50">
                      <span>© 2024-2026 Financial Retarded Times</span>
                      <span className="text-primary/30">•</span>
                      <span className="italic">„Keine Finanzberatung – nur Entertainment"</span>
                    </div>
                  </div>
                </div>
              </footer>
            </main>
          )
        }}
      </EditionProvider>
    </AvatarProvider>
  )
}
