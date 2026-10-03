'use client'

import { TerminalCard, MetricTile } from './TerminalCard'
import { TopUsersPanel } from './TopUsersPanel'
import { useTopUsers } from '../hooks/use-top-users'
import type { UserRange } from '../lib/range-utils'
import { filterDatesLastNDays, computeRangeMetrics } from '../lib/range-utils'
import type { DateStats } from '@/app/newspaper/lib/types'

interface UsersTerminalProps {
  dates: DateStats[]
  selectedDate: string | null
}

const RANK_TABS: { id: UserRange; label: string; desc: string }[] = [
  { id: 'day', label: 'Tag', desc: 'Selected day' },
  { id: '7d', label: '7T', desc: 'Rolling week' },
  { id: '30d', label: '30T', desc: 'Rolling month' },
  { id: 'all', label: 'Gesamt', desc: 'All-time archive' }
]

function LeaderboardColumn({
  range,
  date,
  dates
}: {
  range: UserRange
  date: string | null
  dates: DateStats[]
}) {
  const { users, isLoading } = useTopUsers(range, date, 15)
  const slice =
    range === '7d'
      ? filterDatesLastNDays(dates, 7)
      : range === '30d'
        ? filterDatesLastNDays(dates, 30)
        : range === 'day' && date
          ? dates.filter(d => d.date === date)
          : dates
  const metrics = computeRangeMetrics(slice)

  return (
    <TerminalCard
      title={`Rank · ${RANK_TABS.find(t => t.id === range)?.label}`}
      subtitle={metrics.from && metrics.to ? `${metrics.from} → ${metrics.to}` : ''}
      badge={`${metrics.totalMessages.toLocaleString('de-DE')} msgs`}
    >
      <div className="grid grid-cols-3 gap-2 mb-3">
        <MetricTile label="Msgs" value={metrics.totalMessages.toLocaleString('de-DE')} />
        <MetricTile label="Tage" value={String(metrics.totalDays)} />
        <MetricTile label="Ø" value={String(metrics.avgPerDay)} />
      </div>
      <TopUsersPanel users={users} isLoading={isLoading} limit={15} compact />
    </TerminalCard>
  )
}

export function UsersTerminal({ dates, selectedDate }: UsersTerminalProps) {
  const allMetrics = computeRangeMetrics(dates)
  const w30 = computeRangeMetrics(filterDatesLastNDays(dates, 30))
  const w7 = computeRangeMetrics(filterDatesLastNDays(dates, 7))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile label="All-Time Msgs" value={allMetrics.totalMessages.toLocaleString('de-DE')} />
        <MetricTile label="30T Volume" value={w30.totalMessages.toLocaleString('de-DE')} sub={w30.peakDay ? `Peak ${w30.peakDay.date}` : undefined} />
        <MetricTile label="7T Volume" value={w7.totalMessages.toLocaleString('de-DE')} />
        <MetricTile label="Peak Day" value={allMetrics.peakDay?.messageCount.toLocaleString('de-DE') ?? '—'} sub={allMetrics.peakDay?.date} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {RANK_TABS.map(tab => (
          <LeaderboardColumn key={tab.id} range={tab.id} date={selectedDate} dates={dates} />
        ))}
      </div>
    </div>
  )
}
