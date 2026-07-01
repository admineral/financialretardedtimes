'use client'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import type { DateStats } from '@/app/newspaper/lib/types'
import { ArchiveDateTimeline, type ArchiveTimeRange } from './ArchiveDateTimeline'
import { ContributionCalendar } from './ContributionCalendar'
import { TerminalCard, MetricTile } from './TerminalCard'
import { MessageVolumeChart } from './MessageVolumeChart'
import { InfiniteChatStream } from './InfiniteChatStream'
import { chartSeriesFromDates, computeRangeMetrics } from '../lib/range-utils'

interface CalendarTerminalProps {
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

export function CalendarTerminal({
  dates,
  filteredDates,
  timeRange,
  onTimeRangeChange,
  selectedDate,
  onDateSelect,
  maxDailyMessages,
  isLoadingDates,
  availableDateKeys
}: CalendarTerminalProps) {
  const rangeMetrics = computeRangeMetrics(filteredDates)
  const selectedStats = dates.find(d => d.date === selectedDate)

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
        title="Activity Matrix"
        subtitle={`GitHub-style heatmap · ${filteredDates.length} days in range`}
        badge={timeRange.toUpperCase()}
        contentClassName="pt-1 pb-2"
      >
        <ContributionCalendar
          dates={filteredDates}
          maxDailyMessages={maxDailyMessages}
          selectedDate={selectedDate}
          onDateSelect={onDateSelect}
          cellSize="fluid"
        />
      </TerminalCard>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <TerminalCard
          title="Range Analytics"
          subtitle={`${rangeMetrics.from} → ${rangeMetrics.to}`}
          className="lg:col-span-5"
        >
          <div className="grid grid-cols-2 gap-2 mb-4">
            <MetricTile label="Msgs" value={rangeMetrics.totalMessages.toLocaleString('de-DE')} />
            <MetricTile label="Ø / Tag" value={String(rangeMetrics.avgPerDay)} />
            <MetricTile
              label="Peak"
              value={rangeMetrics.peakDay?.messageCount.toLocaleString('de-DE') ?? '—'}
              sub={rangeMetrics.peakDay?.date}
            />
            <MetricTile label="Tage" value={String(rangeMetrics.totalDays)} />
          </div>
          <MessageVolumeChart data={chartSeriesFromDates(filteredDates)} heightClass="h-[160px]" />
        </TerminalCard>

        {selectedStats && (
          <TerminalCard
            title="Selected Day"
            subtitle={selectedDate ?? ''}
            className="lg:col-span-7"
            action={
              <Button size="sm" className="h-7 text-[10px]" onClick={() => onDateSelect(selectedDate!)}>
                Focus
              </Button>
            }
          >
            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              <div>
                <p className="text-[9px] text-muted-foreground uppercase">Msgs</p>
                <p className="font-mono font-bold">{selectedStats.messageCount.toLocaleString('de-DE')}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground uppercase">Users</p>
                <p className="font-mono font-bold">{selectedStats.uniqueUsers}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground uppercase">Share</p>
                <p className="font-mono font-bold">
                  {rangeMetrics.totalMessages > 0
                    ? `${Math.round((selectedStats.messageCount / rangeMetrics.totalMessages) * 100)}%`
                    : '—'}
                </p>
              </div>
            </div>
            <Separator className="my-3" />
            <ScrollArea className="h-[320px] pr-2">
              {selectedDate && (
                <InfiniteChatStream
                  selectedDate={selectedDate}
                  availableDates={availableDateKeys}
                  compact
                />
              )}
            </ScrollArea>
          </TerminalCard>
        )}
      </div>
    </div>
  )
}
