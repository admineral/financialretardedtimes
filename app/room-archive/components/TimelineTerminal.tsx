'use client'

import type { DateStats } from '@/app/newspaper/lib/types'
import { MessageSquareIcon } from 'lucide-react'
import { TerminalCard, MetricTile } from './TerminalCard'
import { DayActivityChart } from './DayActivityChart'
import type { ActivityBucket } from './DayActivityChart'
import { MessageVolumeChart } from './MessageVolumeChart'
import { TopUsersPanel } from './TopUsersPanel'
import { useTopUsers } from '../hooks/use-top-users'
import {
  chartSeriesFromDates,
  computeRangeMetrics
} from '../lib/range-utils'

interface ActivityMeta {
  peakIndex: number
  peakLabel: string
  totalMessages: number
  mode: 'hourly' | 'daily'
  from: string
  to: string
}

interface TimelineTerminalProps {
  dates: DateStats[]
  filteredDates: DateStats[]
  selectedDate: string | null
  rangeMessageTotal: number
  rangeLabel: string
  activityBuckets: ActivityBucket[]
  activityMeta: ActivityMeta
  activitySubtitle: string
  isLoadingActivity: boolean
}

export function TimelineTerminal({
  dates,
  filteredDates,
  selectedDate,
  rangeMessageTotal,
  rangeLabel,
  activityBuckets,
  activityMeta,
  activitySubtitle,
  isLoadingActivity
}: TimelineTerminalProps) {
  const rangeMetrics = computeRangeMetrics(filteredDates)
  const selectedStats = dates.find(d => d.date === selectedDate)
  const { users, isLoading: usersLoading } = useTopUsers('day', selectedDate, 10)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MetricTile label="Range Msgs" value={rangeMessageTotal.toLocaleString('de-DE')} sub={rangeLabel} />
        <MetricTile label="Ø / Tag" value={String(rangeMetrics.avgPerDay)} />
        <MetricTile label="Peak" value={rangeMetrics.peakDay?.messageCount.toLocaleString('de-DE') ?? '—'} sub={rangeMetrics.peakDay?.date} />
        <MetricTile label="Quiet" value={rangeMetrics.quietDay?.messageCount.toLocaleString('de-DE') ?? '—'} sub={rangeMetrics.quietDay?.date} />
        <MetricTile label="Tag Msgs" value={selectedStats?.messageCount.toLocaleString('de-DE') ?? '—'} sub={selectedDate ?? ''} />
        <MetricTile label="Tag Users" value={selectedStats ? String(selectedStats.uniqueUsers) : '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TerminalCard
          title="Activity Terminal"
          subtitle={activitySubtitle}
          badge={rangeLabel}
          className="lg:col-span-2"
        >
          <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground font-mono">
            <MessageSquareIcon className="h-3.5 w-3.5 text-primary" />
            {rangeMessageTotal.toLocaleString('de-DE')} Nachrichten
            {activityMeta.from && (
              <span className="text-muted-foreground/60">
                {activityMeta.from} → {activityMeta.to}
              </span>
            )}
          </div>
          <DayActivityChart
            buckets={activityBuckets}
            peakIndex={activityMeta.peakIndex}
            peakLabel={activityMeta.peakLabel}
            totalMessages={activityMeta.totalMessages}
            mode={activityMeta.mode}
            isLoading={isLoadingActivity}
          />
        </TerminalCard>

        <TerminalCard title="Volume" subtitle="Range series">
          <MessageVolumeChart data={chartSeriesFromDates(filteredDates)} heightClass="h-[180px]" showUsers />
        </TerminalCard>
      </div>

      <TerminalCard
        title="Top User"
        subtitle={selectedDate ? `Tag · ${selectedDate}` : 'Tag im Timeline auswählen'}
      >
        <TopUsersPanel users={users} isLoading={usersLoading} limit={10} />
      </TerminalCard>
    </div>
  )
}
