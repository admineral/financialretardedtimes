/**
 * Room Archive Explorer
 *
 * Full visualization of the cron-synced chat archive:
 * - Timeline navigator (DateTimeline)
 * - GitHub-style contribution calendar
 * - Infinite scroll chat stream (day-by-day)
 * - Top users leaderboard
 */

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  LayoutGridIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  ScrollTextIcon,
  UsersIcon
} from 'lucide-react'
import { ThemeSwitcher } from '@/components/theme-switcher'
import type { DateStats } from '@/app/newspaper/lib/types'
import {
  ArchiveStatsBar,
  ArchiveDateTimeline,
  filterDatesByRange,
  ContributionCalendar,
  DayActivityChart,
  InfiniteChatStream,
  TopUsersPanel,
  SyncHistoryList
} from './components'
import type { ArchiveTimeRange, ActivityBucket } from './components'
import { cn } from '@/lib/utils'

type ViewTab = 'timeline' | 'calendar' | 'stream' | 'users'

interface SyncStatus {
  last_sync_at: string
  total_messages: number
  is_full_history: boolean
  newest_message_time: string | null
}

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

const TABS: { id: ViewTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'timeline', label: 'Timeline', icon: LayoutGridIcon },
  { id: 'calendar', label: 'Kalender', icon: CalendarDaysIcon },
  { id: 'stream', label: 'Chat-Stream', icon: ScrollTextIcon },
  { id: 'users', label: 'Top User', icon: UsersIcon }
]

export default function RoomArchivePage() {
  const [activeTab, setActiveTab] = useState<ViewTab>('timeline')
  const [dates, setDates] = useState<DateStats[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<ArchiveTimeRange>('1m')
  const [cumulativeUsers, setCumulativeUsers] = useState<Record<number, number>>({})
  const [totalMessages, setTotalMessages] = useState(0)
  const [totalDays, setTotalDays] = useState(0)
  const [maxDailyMessages, setMaxDailyMessages] = useState(0)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
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
  const [topUsers, setTopUsers] = useState<Array<{ username: string; messageCount: number; user_pic?: string; is_moderator?: boolean }>>([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [usersScope, setUsersScope] = useState<'day' | 'all'>('day')

  const fetchStats = useCallback(async (refresh = false) => {
    setIsLoading(true)
    try {
      const response = await fetch(
        `/room-archive/api/stats?room=${DEFAULT_ROOM}${refresh ? '&refresh=true' : ''}`
      )
      if (!response.ok) throw new Error('Failed to load stats')
      const data = await response.json()

      setDates(data.dates || [])
      setTotalMessages(data.totalMessages || 0)
      setTotalDays(data.totalDays || 0)
      setMaxDailyMessages(data.maxDailyMessages || 0)
      setCumulativeUsers(data.cumulativeUsers || {})
      setSyncStatus(data.syncStatus)

      setSelectedDate(prev => {
        if (prev && data.dates?.some((d: DateStats) => d.date === prev)) return prev
        return data.dates?.[0]?.date || null
      })
    } catch (err) {
      console.error('Failed to fetch archive stats:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const fetchRangeActivity = useCallback(async (rangeDates: DateStats[]) => {
    if (rangeDates.length === 0) {
      setActivityBuckets([])
      setActivityMeta({
        peakIndex: 0,
        peakLabel: '00:00',
        totalMessages: 0,
        mode: 'hourly',
        from: '',
        to: ''
      })
      return
    }

    setIsLoadingActivity(true)
    const from = rangeDates[rangeDates.length - 1].date
    const to = rangeDates[0].date

    try {
      const response = await fetch(
        `/room-archive/api/activity?from=${from}&to=${to}&room=${DEFAULT_ROOM}`
      )
      if (response.ok) {
        const data = await response.json()
        setActivityBuckets(data.buckets || [])
        setActivityMeta({
          peakIndex: data.peakIndex ?? 0,
          peakLabel: data.peakLabel || '00:00',
          totalMessages: data.totalMessages || 0,
          mode: data.mode === 'daily' ? 'daily' : 'hourly',
          from: data.from || from,
          to: data.to || to
        })
      }
    } catch (err) {
      console.error('Failed to fetch activity:', err)
    } finally {
      setIsLoadingActivity(false)
    }
  }, [])

  const fetchUsers = useCallback(async (date: string | null, scope: 'day' | 'all') => {
    setIsLoadingUsers(true)
    try {
      const params = new URLSearchParams({ room: DEFAULT_ROOM, limit: '25' })
      if (scope === 'day' && date) params.set('date', date)
      const response = await fetch(`/room-archive/api/users?${params}`)
      if (response.ok) {
        const data = await response.json()
        setTopUsers(data.users || [])
      }
    } catch (err) {
      console.error('Failed to fetch users:', err)
    } finally {
      setIsLoadingUsers(false)
    }
  }, [])

  const filteredDates = useMemo(
    () => filterDatesByRange(dates, timeRange),
    [dates, timeRange]
  )

  useEffect(() => {
    if (activeTab === 'timeline') {
      fetchRangeActivity(filteredDates)
    }
  }, [activeTab, filteredDates, fetchRangeActivity])

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers(selectedDate, usersScope)
    }
  }, [activeTab, selectedDate, usersScope, fetchUsers])

  useEffect(() => {
    if (activeTab === 'timeline' && selectedDate) {
      fetchUsers(selectedDate, 'day')
    }
  }, [activeTab, selectedDate, fetchUsers])

  const selectedDateStats = useMemo(
    () => dates.find(d => d.date === selectedDate) || null,
    [dates, selectedDate]
  )

  const filteredMaxDailyMessages = useMemo(
    () => filteredDates.reduce((max, day) => Math.max(max, day.messageCount), 0),
    [filteredDates]
  )

  const rangeMessageTotal = useMemo(
    () => filteredDates.reduce((sum, day) => sum + day.messageCount, 0),
    [filteredDates]
  )

  const availableDateKeys = useMemo(
    () => dates.map(d => d.date),
    [dates]
  )

  const handleDateSelect = (date: string) => {
    setSelectedDate(date)
  }

  const handleCalendarDateSelect = (date: string) => {
    setSelectedDate(date)
    setActiveTab('stream')
  }

  const activitySubtitle =
    activityMeta.mode === 'daily'
      ? `Tägliche Verteilung · ${RANGE_LABELS[timeRange]} · Europe/Berlin`
      : `Stündliche Verteilung · ${RANGE_LABELS[timeRange]} · Europe/Berlin`

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-primary/10">
        <div className="w-full max-w-[1800px] mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <Link
                href="/newspaper"
                className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                <span className="text-sm hidden sm:inline">Newspaper</span>
              </Link>
              <div className="h-4 w-px bg-primary/20 flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="font-masthead text-xl md:text-2xl gold-text truncate">
                  Room Archive
                </h1>
                <p className="text-[10px] text-muted-foreground truncate">
                  bitcoin_de_DE · Sync alle 5 Min via Vercel Cron
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href="/chat-archive"
                className="hidden md:inline text-xs text-muted-foreground hover:text-primary transition-colors px-2"
              >
                User Archive
              </Link>
              <button
                type="button"
                onClick={() => fetchStats(true)}
                disabled={isLoading}
                className="p-2 hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
                title="Daten aktualisieren"
              >
                <RefreshCwIcon className={cn('h-4 w-4', isLoading && 'animate-spin')} />
              </button>
              <ThemeSwitcher />
            </div>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="w-full max-w-[1800px] mx-auto px-4 md:px-8 py-4">
        <ArchiveStatsBar
          totalMessages={totalMessages}
          totalDays={totalDays}
          uniqueUsers={cumulativeUsers[7]}
          syncStatus={syncStatus}
          selectedDateStats={selectedDateStats}
        />
      </div>

      {/* Tab navigation */}
      <div className="w-full max-w-[1800px] mx-auto px-4 md:px-8">
        <div className="flex items-center gap-1 p-1 bg-card/80 border border-primary/20 rounded-full w-fit mb-4">
          {TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold rounded-full transition-all duration-200',
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Archive timeline — shared across timeline + stream tabs */}
      {(activeTab === 'timeline' || activeTab === 'stream') && (
        <div className="border-y border-primary/10 bg-card/30 mb-6">
          <ArchiveDateTimeline
            availableDates={dates}
            selectedDate={selectedDate}
            isLoadingDates={isLoading}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            onDateSelect={handleDateSelect}
          />
        </div>
      )}

      {/* Content */}
      <div className="w-full max-w-[1800px] mx-auto px-4 md:px-8 pb-12">
        {activeTab === 'timeline' && selectedDate && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="glass-card-gold rounded-lg p-5 border border-primary/20">
                <h2 className="font-headline text-lg mb-1 flex items-center gap-2">
                  <MessageSquareIcon className="h-4 w-4 text-primary" />
                  Aktivität — {rangeMessageTotal.toLocaleString('de-DE')} Nachrichten
                  <span className="text-sm font-mono text-primary/70">({RANGE_LABELS[timeRange]})</span>
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  {activitySubtitle}
                  {activityMeta.from && activityMeta.to && (
                    <span className="ml-2 font-mono text-muted-foreground/60">
                      {activityMeta.from} → {activityMeta.to}
                    </span>
                  )}
                </p>
                <DayActivityChart
                  buckets={activityBuckets}
                  peakIndex={activityMeta.peakIndex}
                  peakLabel={activityMeta.peakLabel}
                  totalMessages={activityMeta.totalMessages}
                  mode={activityMeta.mode}
                  isLoading={isLoadingActivity}
                />
              </div>

              <SyncHistoryList roomId={DEFAULT_ROOM} />
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-foreground/10 bg-card p-5">
                <h3 className="font-headline text-sm mb-4">Top User — {selectedDate}</h3>
                <TopUsersPanel
                  users={topUsers}
                  isLoading={isLoadingUsers}
                  roomId={DEFAULT_ROOM}
                />
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('users')
                    fetchUsers(selectedDate, 'day')
                  }}
                  className="mt-3 text-xs text-primary hover:underline w-full text-center"
                >
                  Alle anzeigen →
                </button>
              </div>

              <div className="rounded-lg border border-foreground/10 bg-card p-5">
                <p className="text-xs text-muted-foreground mb-3">Was wird gespeichert?</p>
                <ul className="text-xs space-y-1.5 text-muted-foreground">
                  <li>· Nachrichten (Text, User, Zeit, Badges)</li>
                  <li>· Links &amp; Quotes (separate Tabellen)</li>
                  <li>· Sync-Status alle 5 Min (Vercel Cron)</li>
                  <li>· Tages-Statistiken im date_stats_cache</li>
                </ul>
                <Link
                  href="/chat-archive"
                  className="mt-4 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <UsersIcon className="h-3 w-3" />
                  User-Profile Archive →
                </Link>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="space-y-6">
            <div className="border border-primary/10 bg-card/30 rounded-lg">
              <ArchiveDateTimeline
                availableDates={dates}
                selectedDate={selectedDate}
                isLoadingDates={isLoading}
                timeRange={timeRange}
                onTimeRangeChange={setTimeRange}
                onDateSelect={handleCalendarDateSelect}
              />
            </div>

            <div className="glass-card-gold rounded-lg p-6 border border-primary/20">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-headline text-lg">Aktivitäts-Kalender</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  GitHub-style Heatmap · Klick öffnet Chat-Stream für den Tag
                </p>
              </div>
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => setActiveTab('stream')}
                  className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-full font-mono"
                >
                  Stream: {selectedDate}
                </button>
              )}
            </div>
            <ContributionCalendar
              dates={filteredDates}
              maxDailyMessages={filteredMaxDailyMessages || maxDailyMessages}
              selectedDate={selectedDate}
              onDateSelect={handleCalendarDateSelect}
            />
            </div>
          </div>
        )}

        {activeTab === 'stream' && selectedDate && (
          <InfiniteChatStream
            selectedDate={selectedDate}
            availableDates={availableDateKeys}
            roomId={DEFAULT_ROOM}
            onDateChange={handleDateSelect}
          />
        )}

        {activeTab === 'users' && (
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center gap-1 p-1 bg-card/80 border border-primary/20 rounded-full">
                <button
                  type="button"
                  onClick={() => setUsersScope('day')}
                  className={cn(
                    'px-3 py-1 text-xs font-mono rounded-full transition-all',
                    usersScope === 'day' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                  )}
                >
                  Tag
                </button>
                <button
                  type="button"
                  onClick={() => setUsersScope('all')}
                  className={cn(
                    'px-3 py-1 text-xs font-mono rounded-full transition-all',
                    usersScope === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                  )}
                >
                  Gesamt
                </button>
              </div>
              {usersScope === 'day' && selectedDate && (
                <span className="text-xs text-muted-foreground font-mono">{selectedDate}</span>
              )}
            </div>

            {usersScope === 'day' && !selectedDate && (
              <p className="text-sm text-muted-foreground mb-4">
                Wähle einen Tag in der Timeline oder im Kalender.
              </p>
            )}

            <TopUsersPanel
              users={topUsers}
              isLoading={isLoadingUsers}
              roomId={DEFAULT_ROOM}
              dateLabel={usersScope === 'day' ? selectedDate || undefined : 'Gesamtes Archiv'}
            />
          </div>
        )}

        {isLoading && dates.length === 0 && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <RefreshCwIcon className="h-5 w-5 animate-spin mr-2" />
            Lade Archiv...
          </div>
        )}
      </div>

      {/* Footer info */}
      {syncStatus?.last_sync_at && (
        <div className="fixed bottom-4 right-4 text-[10px] font-mono text-muted-foreground/50 bg-card/80 border border-foreground/10 px-3 py-1.5 rounded-full backdrop-blur-sm hidden md:block">
          Letzter Cron: {new Date(syncStatus.last_sync_at).toLocaleTimeString('de-DE')}
        </div>
      )}
    </main>
  )
}
