'use client'

import { CalendarDaysIcon } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import type { DateStats } from '@/app/newspaper/lib/types'
import { ContributionCalendar } from './ContributionCalendar'
import { TerminalCard, MetricTile } from './TerminalCard'
import { MessageVolumeChart } from './MessageVolumeChart'
import { InfiniteChatStream } from './InfiniteChatStream'
import { chartSeriesFromDates, computeRangeMetrics } from '../lib/range-utils'

interface CalendarTerminalProps {
  dates: DateStats[]
  filteredDates: DateStats[]
  rangeLabel: string
  rangeMaxDailyMessages: number
  selectedDate: string | null
  onDateSelect: (date: string) => void
  availableDateKeys: string[]
}

export function CalendarTerminal({
  dates,
  filteredDates,
  rangeLabel,
  rangeMaxDailyMessages,
  selectedDate,
  onDateSelect,
  availableDateKeys
}: CalendarTerminalProps) {
  const rangeMetrics = computeRangeMetrics(filteredDates)
  const selectedStats = dates.find(d => d.date === selectedDate)

  return (
    <div className="space-y-4">
      <TerminalCard
        title="Activity Matrix"
        subtitle={`GitHub-style heatmap · ${filteredDates.length} days`}
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

        <TerminalCard
          title="Selected Day"
          subtitle={selectedStats ? (selectedDate ?? '') : 'Kein Tag ausgewählt'}
          className="lg:col-span-7"
        >
          {selectedStats && selectedDate ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Msgs</p>
                  <p className="font-mono font-bold text-base sm:text-lg">{selectedStats.messageCount.toLocaleString('de-DE')}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Users</p>
                  <p className="font-mono font-bold text-base sm:text-lg">{selectedStats.uniqueUsers}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Share</p>
                  <p className="font-mono font-bold text-base sm:text-lg">
                    {rangeMetrics.totalMessages > 0
                      ? `${Math.round((selectedStats.messageCount / rangeMetrics.totalMessages) * 100)}%`
                      : '—'}
                  </p>
                </div>
              </div>
              <Separator className="my-3" />
              <InfiniteChatStream
                selectedDate={selectedDate}
                availableDates={availableDateKeys}
                compact
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-12 text-muted-foreground">
              <CalendarDaysIcon className="h-9 w-9 mb-3 opacity-40" />
              <p className="text-sm">Tag in der Matrix antippen</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Wähle einen aktiven Tag, um Statistiken und Chat zu sehen.
              </p>
            </div>
          )}
        </TerminalCard>
      </div>
    </div>
  )
}
