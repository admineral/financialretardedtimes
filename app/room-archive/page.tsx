/**
 * Room Archive Explorer — Terminal Dashboard
 */

'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ActivityIcon,
  ArrowLeftIcon,
  CalendarDaysIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  RefreshCwIcon,
  ScrollTextIcon,
  UsersIcon,
  ZapIcon
} from 'lucide-react'
import { ThemeSwitcher } from '@/components/theme-switcher'
import {
  ArchiveStatsBar,
  ArchiveDateTimeline,
  filterDatesByRange,
  OverviewDashboard,
  CalendarTerminal,
  StreamTerminal,
  UsersTerminal,
  SyncTerminal,
  TimelineTerminal
} from './components'
import type { ArchiveTimeRange, ActivityBucket } from './components'
import { useArchiveStats } from './hooks/use-archive-stats'
import {
  buildDailyActivityFromStats,
  shouldUseCountsOnlyActivity
} from './lib/activity-from-stats'
import { cn } from '@/lib/utils'
import type { DateStats } from '@/app/newspaper/lib/types'

type ViewTab = 'overview' | 'timeline' | 'calendar' | 'stream' | 'users' | 'sync'

interface ActivityMeta {
  peakIndex: number
  peakLabel: string
  totalMessages: number
  mode: 'hourly' | 'daily'
  from: string
  to: string
}

const RANGE_LABELS: Record<ArchiveTimeRange, string> = {
  '1w': '1W',
  '1m': '1M',
  '1y': '1J',
  all: 'All'
}

const DEFAULT_ROOM = 'bitcoin_de_DE'
const EMPTY_DATES: DateStats[] = []

const TABS: { id: ViewTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboardIcon },
  { id: 'timeline', label: 'Timeline', icon: LayoutGridIcon },
  { id: 'calendar', label: 'Kalender', icon: CalendarDaysIcon },
  { id: 'stream', label: 'Stream', icon: ScrollTextIcon },
  { id: 'users', label: 'Ranks', icon: UsersIcon },
  { id: 'sync', label: 'Sync', icon: ZapIcon }
]

export default function RoomArchivePage() {
  const [activeTab, setActiveTab] = useState<ViewTab>('overview')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<ArchiveTimeRange>('1m')

  const { data: stats, isLoading, isRevalidating, refresh } = useArchiveStats(DEFAULT_ROOM)

  const dates = stats?.dates ?? EMPTY_DATES
  const totalMessages = stats?.totalMessages ?? 0
  const totalDays = stats?.totalDays ?? 0
  const maxDailyMessages = stats?.maxDailyMessages ?? 0
  const cumulativeUsers = stats?.cumulativeUsers ?? {}
  const syncStatus = stats?.syncStatus ?? null

  const [activityBuckets, setActivityBuckets] = useState<ActivityBucket[]>([])
  const [activityMeta, setActivityMeta] = useState<ActivityMeta>({
    peakIndex: 0,
    peakLabel: '00:00',
    totalMessages: 0,
    mode: 'hourly',
    from: '',
    to: ''
  })
  const [isLoadingActivity, setIsLoadingActivity] = useState(false)

  useEffect(() => {
    if (!selectedDate && dates[0]?.date) setSelectedDate(dates[0].date)
  }, [dates, selectedDate])

  const filteredDates = useMemo(
    () => filterDatesByRange(dates, timeRange),
    [dates, timeRange]
  )

  useEffect(() => {
    if (activeTab !== 'timeline' || filteredDates.length === 0) return

    if (shouldUseCountsOnlyActivity(filteredDates.length)) {
      const instant = buildDailyActivityFromStats(filteredDates)
      if (instant) {
        setActivityBuckets(instant.buckets as ActivityBucket[])
        setActivityMeta({
          peakIndex: instant.peakIndex,
          peakLabel: instant.peakLabel,
          totalMessages: instant.totalMessages,
          mode: 'daily',
          from: instant.from,
          to: instant.to
        })
      }
      setIsLoadingActivity(false)
      return
    }

    const from = filteredDates[filteredDates.length - 1].date
    const to = filteredDates[0].date
    let cancelled = false
    setIsLoadingActivity(true)

    fetch(`/room-archive/api/activity?from=${from}&to=${to}&room=${DEFAULT_ROOM}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled || !data) return
        setActivityBuckets(data.buckets || [])
        setActivityMeta({
          peakIndex: data.peakIndex ?? 0,
          peakLabel: data.peakLabel || '00:00',
          totalMessages: data.totalMessages || 0,
          mode: 'hourly',
          from: data.from || from,
          to: data.to || to
        })
      })
      .finally(() => {
        if (!cancelled) setIsLoadingActivity(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeTab, filteredDates])

  const selectedDateStats = useMemo(
    () => dates.find(d => d.date === selectedDate) || null,
    [dates, selectedDate]
  )

  const rangeMessageTotal = useMemo(
    () => filteredDates.reduce((sum, day) => sum + day.messageCount, 0),
    [filteredDates]
  )

  const availableDateKeys = useMemo(() => dates.map(d => d.date), [dates])

  const activitySubtitle =
    activityMeta.mode === 'daily'
      ? `Tägliche Verteilung · ${RANGE_LABELS[timeRange]} · Europe/Berlin`
      : `Stündliche Verteilung · ${RANGE_LABELS[timeRange]} · Europe/Berlin`

  const handleDateSelect = (date: string) => setSelectedDate(date)

  const showRangeNav = activeTab === 'overview'

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-primary/10">
        <div className="w-full max-w-[1920px] mx-auto px-4 md:px-8 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <Link
                href="/newspaper"
                className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                <span className="text-sm hidden sm:inline">Newspaper</span>
              </Link>
              <div className="h-4 w-px bg-primary/20" />
              <div>
                <h1 className="font-masthead text-xl md:text-2xl gold-text">Archive Terminal</h1>
                <p className="text-[10px] font-mono text-muted-foreground">bitcoin_de_DE · QUANT DESK</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(isRevalidating || stats?.cacheState === 'client') && (
                <span className="hidden md:inline text-[10px] font-mono text-primary/60">
                  {stats?.cacheState === 'client' ? 'cached' : 'sync…'}
                </span>
              )}
              <Link href="/chat-archive" className="hidden md:inline text-xs text-muted-foreground hover:text-primary px-2">
                Users
              </Link>
              <button
                type="button"
                onClick={() => refresh()}
                disabled={isLoading || isRevalidating}
                className="p-2 hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCwIcon className={cn('h-4 w-4', (isLoading || isRevalidating) && 'animate-spin')} />
              </button>
              <ThemeSwitcher />
            </div>
          </div>
        </div>
      </header>

      <div className="w-full max-w-[1920px] mx-auto px-4 md:px-8 py-3">
        <ArchiveStatsBar
          totalMessages={totalMessages}
          totalDays={totalDays}
          uniqueUsers={cumulativeUsers[30] ?? cumulativeUsers[7]}
          syncStatus={syncStatus}
          selectedDateStats={selectedDateStats}
        />
      </div>

      <div className="w-full max-w-[1920px] mx-auto px-4 md:px-8 pb-2">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-card/80 border border-primary/20 rounded-lg w-full sm:w-fit">
          {TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-semibold rounded-md transition-all',
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {showRangeNav && (
        <div className="border-y border-primary/10 bg-card/20 mb-4">
          <ArchiveDateTimeline
            availableDates={dates}
            selectedDate={selectedDate}
            isLoadingDates={isLoading && dates.length === 0}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            onDateSelect={handleDateSelect}
          />
        </div>
      )}

      <div className="w-full max-w-[1920px] mx-auto px-4 md:px-8 pb-16">
        {activeTab === 'overview' && (
          <OverviewDashboard
            dates={dates}
            totalMessages={totalMessages}
            totalDays={totalDays}
            maxDailyMessages={maxDailyMessages}
            syncStatus={syncStatus}
            selectedDate={selectedDate}
            onDateSelect={d => {
              handleDateSelect(d)
              setActiveTab('stream')
            }}
            onOpenStream={() => setActiveTab('stream')}
            onOpenSync={() => setActiveTab('sync')}
          />
        )}

        {activeTab === 'timeline' && (
          <TimelineTerminal
            dates={dates}
            filteredDates={filteredDates}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            isLoadingDates={isLoading && dates.length === 0}
            rangeMessageTotal={rangeMessageTotal}
            rangeLabel={RANGE_LABELS[timeRange]}
            activityBuckets={activityBuckets}
            activityMeta={activityMeta}
            activitySubtitle={activitySubtitle}
            isLoadingActivity={isLoadingActivity}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarTerminal
            dates={dates}
            filteredDates={filteredDates}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            maxDailyMessages={maxDailyMessages}
            isLoadingDates={isLoading && dates.length === 0}
            availableDateKeys={availableDateKeys}
          />
        )}

        {activeTab === 'stream' && (
          <StreamTerminal
            dates={dates}
            filteredDates={filteredDates}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            maxDailyMessages={maxDailyMessages}
            isLoadingDates={isLoading && dates.length === 0}
            availableDateKeys={availableDateKeys}
          />
        )}

        {activeTab === 'users' && (
          <UsersTerminal dates={dates} selectedDate={selectedDate} />
        )}

        {activeTab === 'sync' && (
          <SyncTerminal
            syncStatus={syncStatus}
            totalMessages={totalMessages}
            onRefreshStats={refresh}
          />
        )}

        {isLoading && dates.length === 0 && (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <ActivityIcon className="h-5 w-5 animate-spin mr-2" />
            Terminal boot…
          </div>
        )}
      </div>
    </main>
  )
}
