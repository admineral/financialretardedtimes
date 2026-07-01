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
import { DateTimeline } from '@/app/newspaper/components/DateTimeline'
import type { DateStats } from '@/app/newspaper/lib/types'
import type { DayRange } from '@/app/newspaper/components/DateTimeline'
import {
  ArchiveStatsBar,
  ContributionCalendar,
  DayActivityChart,
  InfiniteChatStream,
  TopUsersPanel
} from './components'
import { cn } from '@/lib/utils'

type ViewTab = 'timeline' | 'calendar' | 'stream' | 'users'

interface SyncStatus {
  last_sync_at: string
  total_messages: number
  is_full_history: boolean
  newest_message_time: string | null
}

interface SyncHistoryEntry {
  id: number
  started_at: string
  completed_at: string | null
  success: boolean
  messages_inserted: number
  trigger_type: string
}

interface ActivityBucket {
  hour: number
  label: string
  count: number
  uniqueUsers: number
  intensity: number
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
  const [, setDayRange] = useState<DayRange>(1)
  const [cumulativeUsers, setCumulativeUsers] = useState<Record<number, number>>({})
  const [totalMessages, setTotalMessages] = useState(0)
  const [totalDays, setTotalDays] = useState(0)
  const [maxDailyMessages, setMaxDailyMessages] = useState(0)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [syncHistory, setSyncHistory] = useState<SyncHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activityBuckets, setActivityBuckets] = useState<ActivityBucket[]>([])
  const [activityMeta, setActivityMeta] = useState({ peakHour: 0, totalMessages: 0 })
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
      setSyncHistory(data.syncHistory || [])

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

  const fetchActivity = useCallback(async (date: string) => {
    setIsLoadingActivity(true)
    try {
      const response = await fetch(
        `/room-archive/api/activity?date=${date}&room=${DEFAULT_ROOM}`
      )
      if (response.ok) {
        const data = await response.json()
        setActivityBuckets(data.buckets || [])
        setActivityMeta({ peakHour: data.peakHour || 0, totalMessages: data.totalMessages || 0 })
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

  useEffect(() => {
    if (selectedDate && (activeTab === 'timeline' || activeTab === 'stream')) {
      fetchActivity(selectedDate)
    }
  }, [selectedDate, activeTab, fetchActivity])

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

  const availableDateKeys = useMemo(
    () => dates.map(d => d.date),
    [dates]
  )

  const handleDateSelect = (date: string) => {
    setSelectedDate(date)
    setDayRange(1)
    if (activeTab !== 'stream') return
  }

  const handleCalendarDateSelect = (date: string) => {
    setSelectedDate(date)
    setActiveTab('stream')
  }

  const handleDayRangeChange = (_range: DayRange, _dates: string[]) => {
    // Archive explorer uses dayRange only for DateTimeline display
  }

  const lastSync = syncHistory[0]

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
                href="/Test/admin"
                className="hidden md:inline text-xs text-muted-foreground hover:text-primary transition-colors px-2"
              >
                Admin
              </Link>
              <Link
                href="/newspaper/archive"
                className="hidden md:inline text-xs text-muted-foreground hover:text-primary transition-colors px-2"
              >
                Raw DB
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

      {/* DateTimeline — shared across timeline + stream tabs */}
      {(activeTab === 'timeline' || activeTab === 'stream') && (
        <div className="border-y border-primary/10 bg-card/30 mb-6">
          <DateTimeline
            availableDates={dates}
            selectedDate={selectedDate}
            isLoadingDates={isLoading}
            isLoading={false}
            onDateSelect={handleDateSelect}
            onDayRangeChange={handleDayRangeChange}
            cumulativeUsers={cumulativeUsers}
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
                  Aktivität — {selectedDateStats?.messageCount.toLocaleString('de-DE')} Nachrichten
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  Stündliche Verteilung (Europe/Berlin)
                </p>
                <DayActivityChart
                  buckets={activityBuckets}
                  peakHour={activityMeta.peakHour}
                  totalMessages={activityMeta.totalMessages}
                  isLoading={isLoadingActivity}
                />
              </div>

              <div className="rounded-lg border border-foreground/10 bg-card p-5">
                <h3 className="font-headline text-sm mb-3 text-muted-foreground">Sync-Verlauf</h3>
                <div className="space-y-2">
                  {syncHistory.slice(0, 5).map(entry => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between text-xs py-1.5 border-b border-foreground/5 last:border-0"
                    >
                      <span className={entry.success ? 'text-green-500' : 'text-red-500'}>
                        {entry.success ? '✓' : '✗'} {entry.trigger_type}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        +{entry.messages_inserted} msgs
                      </span>
                      <span className="text-muted-foreground/60">
                        {new Date(entry.started_at).toLocaleString('de-DE', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  ))}
                  {syncHistory.length === 0 && (
                    <p className="text-xs text-muted-foreground">Kein Sync-Verlauf</p>
                  )}
                </div>
              </div>
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
              dates={dates}
              maxDailyMessages={maxDailyMessages}
              selectedDate={selectedDate}
              onDateSelect={handleCalendarDateSelect}
            />
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
      {lastSync && (
        <div className="fixed bottom-4 right-4 text-[10px] font-mono text-muted-foreground/50 bg-card/80 border border-foreground/10 px-3 py-1.5 rounded-full backdrop-blur-sm hidden md:block">
          Letzter Cron: {new Date(lastSync.started_at).toLocaleTimeString('de-DE')}
          {lastSync.messages_inserted > 0 && ` · +${lastSync.messages_inserted}`}
        </div>
      )}
    </main>
  )
}
