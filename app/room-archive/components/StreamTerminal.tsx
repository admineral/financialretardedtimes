'use client'

import type { DateStats } from '@/app/newspaper/lib/types'
import { ArchiveDateTimeline, type ArchiveTimeRange } from './ArchiveDateTimeline'
import { ContributionCalendar } from './ContributionCalendar'
import { InfiniteChatStream } from './InfiniteChatStream'
import { TerminalCard, MetricTile } from './TerminalCard'
import { Badge } from '@/components/ui/badge'

interface StreamTerminalProps {
  dates: DateStats[]
  filteredDates: DateStats[]
  timeRange: ArchiveTimeRange
  onTimeRangeChange: (r: ArchiveTimeRange) => void
  selectedDate: string | null
  onDateSelect: (date: string) => void
  maxDailyMessages: number
  isLoadingDates: boolean
  availableDateKeys: string[]
}

export function StreamTerminal({
  dates,
  timeRange,
  onTimeRangeChange,
  selectedDate,
  onDateSelect,
  maxDailyMessages,
  isLoadingDates,
  availableDateKeys
}: StreamTerminalProps) {
  const dayStats = dates.find(d => d.date === selectedDate)

  return (
    <div className="space-y-4">
      <ArchiveDateTimeline
        availableDates={dates}
        selectedDate={selectedDate}
        isLoadingDates={isLoadingDates}
        timeRange={timeRange}
        onTimeRangeChange={onTimeRangeChange}
        onDateSelect={onDateSelect}
      />

      <TerminalCard
        title="Day Picker"
        subtitle={`Full archive · ${dates.length} days`}
        badge="ALL"
        contentClassName="pt-1 pb-2"
      >
        <ContributionCalendar
          dates={dates}
          maxDailyMessages={maxDailyMessages}
          selectedDate={selectedDate}
          onDateSelect={onDateSelect}
          cellSize="fluid"
        />
      </TerminalCard>

      {dayStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricTile label="Selected" value={selectedDate ?? '—'} sub="Active day" />
          <MetricTile label="Msgs" value={dayStats.messageCount.toLocaleString('de-DE')} />
          <MetricTile label="Users" value={String(dayStats.uniqueUsers)} />
          <MetricTile
            label="Archive"
            value={dates.length.toLocaleString('de-DE')}
            sub={`${dates.reduce((s, d) => s + d.messageCount, 0).toLocaleString('de-DE')} total msgs`}
          />
        </div>
      )}

      <TerminalCard
        title="Live Archive Stream"
        subtitle="Infinite scroll · ältere Tage nach oben"
        badge="FEED"
        noPadding
        action={
          selectedDate ? (
            <Badge variant="outline" className="font-mono text-[10px]">
              {selectedDate}
            </Badge>
          ) : undefined
        }
      >
        {selectedDate ? (
          <InfiniteChatStream
            selectedDate={selectedDate}
            availableDates={availableDateKeys}
            onDateChange={onDateSelect}
          />
        ) : (
          <p className="p-8 text-sm text-muted-foreground text-center">Tag im Day Picker auswählen</p>
        )}
      </TerminalCard>
    </div>
  )
}
