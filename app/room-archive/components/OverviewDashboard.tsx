'use client'

import Link from 'next/link'
import { MessageSquareIcon, TrendingUpIcon, UsersIcon, ZapIcon } from 'lucide-react'
import type { DateStats } from '@/app/newspaper/lib/types'
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
  filterDatesLastNDays
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
  totalMessages: number
  totalDays: number
  maxDailyMessages: number
  syncStatus: SyncStatus | null
  selectedDate: string | null
  onDateSelect: (date: string) => void
  onOpenStream: () => void
  onOpenSync: () => void
}

export function OverviewDashboard({
  dates,
  totalMessages,
  totalDays,
  maxDailyMessages,
  syncStatus,
  selectedDate,
  onDateSelect,
  onOpenStream,
  onOpenSync
}: OverviewDashboardProps) {
  const last30 = filterDatesLastNDays(dates, 30)
  const last7 = filterDatesLastNDays(dates, 7)
  const metrics30 = computeRangeMetrics(last30)
  const metrics7 = computeRangeMetrics(last7)
  const { points, btcSpot, isLoading: btcLoading } = useBtcOverlay(last30, true)
  const { data: leaders, isLoading: leadersLoading } = useTopUsersMulti(['7d', '30d', 'all'], selectedDate)

  const weekActivity = buildDailyActivityFromStats(last7)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MetricTile label="Gesamt Msgs" value={totalMessages.toLocaleString('de-DE')} sub={`${totalDays} Tage`} />
        <MetricTile label="30T Msgs" value={metrics30.totalMessages.toLocaleString('de-DE')} sub={`Ø ${metrics30.avgPerDay}/Tag`} />
        <MetricTile label="7T Msgs" value={metrics7.totalMessages.toLocaleString('de-DE')} sub={`${metrics7.totalDays} aktive Tage`} />
        <MetricTile
          label="Peak Tag"
          value={metrics30.peakDay?.messageCount.toLocaleString('de-DE') ?? '—'}
          sub={metrics30.peakDay?.date}
        />
        <MetricTile
          label="Sync"
          value={syncStatus?.last_sync_at ? new Date(syncStatus.last_sync_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—'}
          sub={syncStatus?.is_full_history ? 'Vollständig' : 'Teilweise'}
        />
        <MetricTile label="Room" value="BTC DE" sub="bitcoin_de_DE" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <TerminalCard
          title="BTC × Chat Volume"
          subtitle="Daily close vs message count · 30D"
          badge="OVERLAY"
          className="xl:col-span-8"
          contentClassName="pt-2"
        >
          <BtcChatOverlayChart data={points} btcSpot={btcSpot} isLoading={btcLoading} />
        </TerminalCard>

        <TerminalCard title="7T Activity" subtitle="Daily distribution" className="xl:col-span-4">
          {weekActivity ? (
            <DayActivityChart
              buckets={weekActivity.buckets as ActivityBucket[]}
              peakIndex={weekActivity.peakIndex}
              peakLabel={weekActivity.peakLabel}
              totalMessages={weekActivity.totalMessages}
              mode="daily"
            />
          ) : (
            <p className="text-xs text-muted-foreground">Keine 7T Daten</p>
          )}
        </TerminalCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <TerminalCard
          title="Volume Terminal"
          subtitle="Message flow · 30 days"
          className="lg:col-span-5"
        >
          <MessageVolumeChart data={chartSeriesFromDates(last30)} heightClass="h-[200px]" />
        </TerminalCard>

        <TerminalCard
          title="Activity Heatmap"
          subtitle="Click day → stream"
          className="lg:col-span-4"
          action={
            selectedDate && (
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={onOpenStream}>
                Stream
              </Button>
            )
          }
        >
          <ContributionCalendar
            dates={last30}
            maxDailyMessages={maxDailyMessages}
            selectedDate={selectedDate}
            onDateSelect={onDateSelect}
          />
        </TerminalCard>

        <div className="lg:col-span-3 space-y-4">
          <TerminalCard title="Leader 7T" badge="RANK">
            <TopUsersPanel users={leaders['7d']} isLoading={leadersLoading} limit={5} compact />
          </TerminalCard>
          <TerminalCard title="Leader 30T" badge="RANK">
            <TopUsersPanel users={leaders['30d']} isLoading={leadersLoading} limit={5} compact />
          </TerminalCard>
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
