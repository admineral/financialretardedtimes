'use client'

import type { DateStats } from '@/app/newspaper/lib/types'
import { ArchiveDateTimeline, type ArchiveTimeRange } from './ArchiveDateTimeline'
import { ContributionCalendar } from './ContributionCalendar'
import { InfiniteChatStream } from './InfiniteChatStream'
import { TerminalCard, MetricTile } from './TerminalCard'
import { MessageVolumeChart } from './MessageVolumeChart'
import { chartSeriesFromDates } from '../lib/range-utils'

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
  filteredDates,
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

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-3 space-y-4">
          <TerminalCard title="Day Picker" subtitle="Heatmap navigator">
            <ContributionCalendar
              dates={filteredDates}
              maxDailyMessages={maxDailyMessages}
              selectedDate={selectedDate}
              onDateSelect={onDateSelect}
              cellSize="lg"
            />
          </TerminalCard>
          {dayStats && (
            <TerminalCard title="Day Stats">
              <div className="grid grid-cols-2 gap-2">
                <MetricTile label="Msgs" value={dayStats.messageCount.toLocaleString('de-DE')} />
                <MetricTile label="Users" value={String(dayStats.uniqueUsers)} />
              </div>
              <div className="mt-3">
                <MessageVolumeChart
                  data={chartSeriesFromDates([dayStats])}
                  heightClass="h-[80px]"
                />
              </div>
            </TerminalCard>
          )}
        </div>

        <TerminalCard
          title="Live Archive Stream"
          subtitle="Infinite scroll · ältere Tage nach oben"
          badge="FEED"
          className="xl:col-span-9"
          noPadding
        >
          {selectedDate ? (
            <InfiniteChatStream
              selectedDate={selectedDate}
              availableDates={availableDateKeys}
              onDateChange={onDateSelect}
            />
          ) : (
            <p className="p-8 text-sm text-muted-foreground text-center">Tag auswählen</p>
          )}
        </TerminalCard>
      </div>
    </div>
  )
}
