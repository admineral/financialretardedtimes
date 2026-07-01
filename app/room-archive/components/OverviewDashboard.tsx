'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { MessageSquareIcon, TrendingUpIcon, ZapIcon } from 'lucide-react'
import type { DateStats } from '@/app/newspaper/lib/types'
import type { ArchiveTimeRange } from './ArchiveDateTimeline'
import { TerminalCard, MetricTile } from './TerminalCard'
import { MessageVolumeChart } from './MessageVolumeChart'
import { BtcChatOverlayChart } from './BtcChatOverlayChart'
import { ContributionCalendar } from './ContributionCalendar'
import { TopUsersPanel } from './TopUsersPanel'
import { DayActivityChart } from './DayActivityChart'
import type { ActivityBucket } from './DayActivityChart'
import { useBtcOverlay } from '../hooks/use-btc-overlay'
import { useTopUsersMulti } from '../hooks/use-top-users'
import {
  chartSeriesFromDates,
  computeRangeMetrics,
  datesStatsSignature,
  type UserRange
} from '../lib/range-utils'
import { buildDailyActivityFromStats } from '../lib/activity-from-stats'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface SyncStatus {
  last_sync_at: string
  total_messages: number
  is_full_history: boolean
}

interface OverviewDashboardProps {
  dates: DateStats[]
  filteredDates: DateStats[]
  timeRange: ArchiveTimeRange
  rangeLabel: string
  rangeMaxDailyMessages: number
  totalMessages: number
  totalDays: number
  syncStatus: SyncStatus | null
  selectedDate: string | null
  onDateSelect: (date: string) => void
  onOpenStream: () => void
  onOpenSync: () => void
}

function leaderRangesForTimeRange(timeRange: ArchiveTimeRange): UserRange[] {
  switch (timeRange) {
    case '1w':
      return ['7d', 'day', 'all']
    case '1m':
      return ['30d', '7d', 'all']
    case '1y':
      return ['30d', 'all', '7d']
    default:
      return ['all', '30d', '7d']
  }
}

function leaderLabel(range: UserRange): string {
  switch (range) {
    case 'day':
      return 'Leader Tag'
    case '7d':
      return 'Leader 7T'
    case '30d':
      return 'Leader 30T'
    default:
      return 'Leader Gesamt'
  }
}

export function OverviewDashboard({
  dates,
  filteredDates,
  timeRange,
  rangeLabel,
  rangeMaxDailyMessages,
  totalMessages,
  totalDays,
  syncStatus,
  selectedDate,
  onDateSelect,
  onOpenStream,
  onOpenSync
}: OverviewDashboardProps) {
  const rangeSig = datesStatsSignature(filteredDates)
  const rangeMetrics = useMemo(() => computeRangeMetrics(filteredDates), [rangeSig])
  const leaderRanges = useMemo(() => leaderRangesForTimeRange(timeRange), [timeRange])
  const { points, btcSpot, isLoading: btcLoading } = useBtcOverlay(filteredDates, filteredDates.length > 0)
  const { data: leaders, isLoading: leadersLoading } = useTopUsersMulti(leaderRanges, selectedDate)

  const rangeActivity = useMemo(
    () => buildDailyActivityFromStats(filteredDates),
    [rangeSig]
  )

  const [primaryLeader, secondaryLeader, tertiaryLeader] = leaderRanges

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MetricTile
          label={`Range · ${rangeLabel}`}
          value={rangeMetrics.totalMessages.toLocaleString('de-DE')}
          sub={`${rangeMetrics.totalDays} Tage`}
        />
        <MetricTile label="Ø / Tag" value={String(rangeMetrics.avgPerDay)} sub={rangeLabel} />
        <MetricTile
          label="Peak Tag"
          value={rangeMetrics.peakDay?.messageCount.toLocaleString('de-DE') ?? '—'}
          sub={rangeMetrics.peakDay?.date}
        />
        <MetricTile label="Gesamt Msgs" value={totalMessages.toLocaleString('de-DE')} sub={`${totalDays} Tage Archiv`} />
        <MetricTile
          label="Sync"
          value={
            syncStatus?.last_sync_at
              ? new Date(syncStatus.last_sync_at).toLocaleTimeString('de-DE', {
                  hour: '2-digit',
                  minute: '2-digit'
                })
              : '—'
          }
          sub={syncStatus?.is_full_history ? 'Vollständig' : 'Teilweise'}
        />
        <MetricTile label="Room" value="BTC DE" sub="bitcoin_de_DE" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <TerminalCard
          title="BTC × Chat Volume"
          subtitle={`Daily close vs message count · ${rangeLabel}`}
          badge="OVERLAY"
          className="xl:col-span-8"
          contentClassName="pt-2"
        >
          <BtcChatOverlayChart data={points} btcSpot={btcSpot} isLoading={btcLoading} />
        </TerminalCard>

        <TerminalCard title="Range Activity" subtitle={`Daily distribution · ${rangeLabel}`} className="xl:col-span-4">
          {rangeActivity ? (
            <DayActivityChart
              buckets={rangeActivity.buckets as ActivityBucket[]}
              peakIndex={rangeActivity.peakIndex}
              peakLabel={rangeActivity.peakLabel}
              totalMessages={rangeActivity.totalMessages}
              mode="daily"
            />
          ) : (
            <p className="text-xs text-muted-foreground">Keine Daten in {rangeLabel}</p>
          )}
        </TerminalCard>
      </div>

      <TerminalCard
        title="Activity Heatmap"
        subtitle={`${filteredDates.length} days · ${rangeLabel}`}
        badge={rangeLabel}
        action={
          selectedDate && (
            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={onOpenStream}>
              Stream
            </Button>
          )
        }
        contentClassName="pt-1 pb-2"
      >
        <ContributionCalendar
          dates={filteredDates}
          maxDailyMessages={rangeMaxDailyMessages}
          selectedDate={selectedDate}
          onDateSelect={onDateSelect}
          cellSize="auto"
        />
      </TerminalCard>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <TerminalCard
          title="Volume Terminal"
          subtitle={`Message flow · ${rangeLabel}`}
          className="lg:col-span-5"
        >
          <MessageVolumeChart data={chartSeriesFromDates(filteredDates)} heightClass="h-[200px]" />
        </TerminalCard>

        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {primaryLeader && (
            <TerminalCard title={leaderLabel(primaryLeader)} badge="RANK">
              <TopUsersPanel users={leaders[primaryLeader]} isLoading={leadersLoading} limit={5} compact />
            </TerminalCard>
          )}
          {secondaryLeader && (
            <TerminalCard title={leaderLabel(secondaryLeader)} badge="RANK">
              <TopUsersPanel users={leaders[secondaryLeader]} isLoading={leadersLoading} limit={5} compact />
            </TerminalCard>
          )}
          {tertiaryLeader && (
            <TerminalCard title={leaderLabel(tertiaryLeader)} badge="RANK">
              <TopUsersPanel users={leaders[tertiaryLeader]} isLoading={leadersLoading} limit={5} compact />
            </TerminalCard>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TerminalCard title="Quick Actions" className="md:col-span-1">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" className="text-xs" onClick={onOpenStream}>
              <MessageSquareIcon className="h-3.5 w-3.5 mr-1" /> Chat Stream
            </Button>
            <Button size="sm" variant="outline" className="text-xs" onClick={onOpenSync}>
              <ZapIcon className="h-3.5 w-3.5 mr-1" /> Sync Monitor
            </Button>
            <Button size="sm" variant="outline" className="text-xs" asChild>
              <Link href="/chat-archive">User Archive</Link>
            </Button>
          </div>
        </TerminalCard>

        <TerminalCard title="All-Time Top" className="md:col-span-2">
          <TopUsersPanel users={leaders.all} isLoading={leadersLoading} limit={8} />
        </TerminalCard>
      </div>

      {selectedDate && (
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <Badge variant="outline">Selected: {selectedDate}</Badge>
          <TrendingUpIcon className="h-3 w-3" />
          <span>
            {dates.find(d => d.date === selectedDate)?.messageCount.toLocaleString('de-DE')} msgs ·{' '}
            {dates.find(d => d.date === selectedDate)?.uniqueUsers} users
          </span>
        </div>
      )}
    </div>
  )
}
