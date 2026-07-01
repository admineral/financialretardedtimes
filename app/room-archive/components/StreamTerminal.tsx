'use client'

import type { DateStats } from '@/app/newspaper/lib/types'
import { ContributionCalendar } from './ContributionCalendar'
import { InfiniteChatStream } from './InfiniteChatStream'
import { TerminalCard, MetricTile } from './TerminalCard'
import { Badge } from '@/components/ui/badge'
import { computeRangeMetrics } from '../lib/range-utils'

interface StreamTerminalProps {
  filteredDates: DateStats[]
  rangeLabel: string
  rangeMaxDailyMessages: number
  selectedDate: string | null
  onDateSelect: (date: string) => void
  availableDateKeys: string[]
}

export function StreamTerminal({
  filteredDates,
  rangeLabel,
  rangeMaxDailyMessages,
  selectedDate,
  onDateSelect,
  availableDateKeys
}: StreamTerminalProps) {
  const dayStats = filteredDates.find(d => d.date === selectedDate)
  const rangeMetrics = computeRangeMetrics(filteredDates)

  return (
    <div className="space-y-4">
      <TerminalCard
        title="Day Picker"
        subtitle={`${filteredDates.length} days · ${rangeLabel}`}
        badge={rangeLabel}
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

      {dayStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricTile label="Selected" value={selectedDate ?? '—'} sub="Active day" />
          <MetricTile label="Msgs" value={dayStats.messageCount.toLocaleString('de-DE')} />
          <MetricTile label="Users" value={String(dayStats.uniqueUsers)} />
          <MetricTile
            label={`Range · ${rangeLabel}`}
            value={rangeMetrics.totalMessages.toLocaleString('de-DE')}
            sub={`${rangeMetrics.totalDays} Tage`}
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
