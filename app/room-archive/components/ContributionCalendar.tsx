'use client'

import { Fragment, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { DateStats } from '@/app/newspaper/lib/types'

interface ContributionCalendarProps {
  dates: DateStats[]
  maxDailyMessages: number
  selectedDate: string | null
  onDateSelect: (date: string) => void
  className?: string
  cellSize?: 'sm' | 'lg' | 'fluid'
}

function getIntensityLevel(count: number, max: number): number {
  if (count === 0) return 0
  const ratio = count / max
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

const INTENSITY_CLASSES = [
  'bg-muted/30 border-border/30',
  'bg-primary/20 border-primary/30',
  'bg-primary/40 border-primary/40',
  'bg-primary/60 border-primary/50',
  'bg-primary border-primary shadow-sm shadow-primary/30'
]

function buildCalendarGrid(dates: DateStats[]) {
  if (dates.length === 0) {
    return { weeks: [] as Array<Array<{ date: string; count: number; stats?: DateStats } | null>>, monthLabels: [] as string[] }
  }

  const countByDate = new Map(dates.map(d => [d.date, d]))
  const sorted = [...dates].sort((a, b) => a.date.localeCompare(b.date))
  const firstDate = new Date(sorted[0].date + 'T12:00:00')
  const lastDate = new Date(sorted[sorted.length - 1].date + 'T12:00:00')

  const start = new Date(firstDate)
  start.setDate(start.getDate() - start.getDay())

  const end = new Date(lastDate)
  end.setDate(end.getDate() + (6 - end.getDay()))

  const weeksData: Array<Array<{ date: string; count: number; stats?: DateStats } | null>> = []
  const labels: string[] = []
  let lastMonth = -1

  const cursor = new Date(start)
  while (cursor <= end) {
    const week: Array<{ date: string; count: number; stats?: DateStats } | null> = []

    for (let d = 0; d < 7; d++) {
      const dateKey = cursor.toISOString().split('T')[0]
      const stats = countByDate.get(dateKey)
      const inRange = cursor >= firstDate && cursor <= lastDate

      if (d === 0) {
        const month = cursor.getMonth()
        if (month !== lastMonth) {
          labels.push(cursor.toLocaleDateString('de-DE', { month: 'short' }))
          lastMonth = month
        } else {
          labels.push('')
        }
      }

      if (inRange) {
        week.push({
          date: dateKey,
          count: stats?.messageCount || 0,
          stats
        })
      } else {
        week.push(null)
      }

      cursor.setDate(cursor.getDate() + 1)
    }

    weeksData.push(week)
  }

  return { weeks: weeksData, monthLabels: labels }
}

function CalendarCell({
  cell,
  max,
  selectedDate,
  onDateSelect,
  cellClass
}: {
  cell: { date: string; count: number; stats?: DateStats } | null
  max: number
  selectedDate: string | null
  onDateSelect: (date: string) => void
  cellClass: string
}) {
  if (!cell) {
    return <div className={cellClass} aria-hidden />
  }

  const level = getIntensityLevel(cell.count, max)
  const isSelected = selectedDate === cell.date

  return (
    <button
      type="button"
      title={`${cell.date}: ${cell.count.toLocaleString('de-DE')} Nachrichten`}
      onClick={() => onDateSelect(cell.date)}
      className={cn(
        cellClass,
        'rounded-sm border transition-all duration-150',
        INTENSITY_CLASSES[level],
        isSelected && 'ring-2 ring-primary ring-offset-1 ring-offset-background z-10',
        cell.count > 0 && 'hover:brightness-110 cursor-pointer',
        cell.count === 0 && 'opacity-40 cursor-default'
      )}
    />
  )
}

export function ContributionCalendar({
  dates,
  maxDailyMessages,
  selectedDate,
  onDateSelect,
  className,
  cellSize = 'sm'
}: ContributionCalendarProps) {
  const { weeks, monthLabels } = useMemo(() => buildCalendarGrid(dates), [dates])

  const dayLabels = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
  const max = maxDailyMessages || 1
  const isFluid = cellSize === 'fluid'
  const cellPx = cellSize === 'lg' ? 18 : 14
  const cellClass = isFluid
    ? 'w-full aspect-square max-h-5 sm:max-h-6 md:max-h-7'
    : cellSize === 'lg'
      ? 'w-[18px] h-[18px]'
      : 'w-[14px] h-[14px]'

  if (dates.length === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground py-8 text-center', className)}>
        Keine Archivdaten vorhanden
      </div>
    )
  }

  if (isFluid) {
    return (
      <div className={cn('w-full', className)}>
        <div
          className="w-full grid gap-1"
          style={{ gridTemplateColumns: `2.25rem repeat(${weeks.length}, minmax(0, 1fr))` }}
        >
          <div aria-hidden />
          {monthLabels.map((label, i) => (
            <span
              key={i}
              className="text-[10px] text-muted-foreground/70 truncate px-0.5 self-end pb-0.5"
            >
              {label}
            </span>
          ))}

          {dayLabels.map((label, rowIdx) => (
            <Fragment key={label}>
              <span
                className={cn(
                  'text-[10px] text-muted-foreground/60 flex items-center justify-end pr-1',
                  rowIdx % 2 === 0 ? 'opacity-100' : 'opacity-0 sm:opacity-100'
                )}
              >
                {label}
              </span>
              {weeks.map((week, weekIdx) => (
                <div key={`${weekIdx}-${rowIdx}`} className="min-w-0">
                  <CalendarCell
                    cell={week[rowIdx]}
                    max={max}
                    selectedDate={selectedDate}
                    onDateSelect={onDateSelect}
                    cellClass={cellClass}
                  />
                </div>
              ))}
            </Fragment>
          ))}
        </div>

        <CalendarLegend dates={dates} />
      </div>
    )
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <div className="inline-block min-w-full">
        <div className="flex gap-1 mb-2 pl-8">
          {monthLabels.map((label, i) => (
            <span
              key={i}
              className="text-[10px] text-muted-foreground/70 flex-shrink-0"
              style={{ minWidth: cellPx }}
            >
              {label}
            </span>
          ))}
        </div>

        <div className="flex gap-1">
          <div className="flex flex-col gap-1 pr-1 flex-shrink-0">
            {dayLabels.map((label, i) => (
              <span
                key={label}
                className={cn(
                  'text-[10px] text-muted-foreground/60 h-[14px] leading-[14px]',
                  i % 2 === 0 ? 'opacity-100' : 'opacity-0 sm:opacity-100'
                )}
              >
                {label}
              </span>
            ))}
          </div>

          <div className="flex gap-1">
            {weeks.map((week, weekIdx) => (
              <div key={weekIdx} className="flex flex-col gap-1">
                {week.map((cell, dayIdx) => (
                  <CalendarCell
                    key={dayIdx}
                    cell={cell}
                    max={max}
                    selectedDate={selectedDate}
                    onDateSelect={onDateSelect}
                    cellClass={cellClass}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <CalendarLegend dates={dates} />
      </div>
    </div>
  )
}

function CalendarLegend({ dates }: { dates: DateStats[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mt-4 text-[10px] text-muted-foreground">
      <span>Weniger</span>
      {INTENSITY_CLASSES.map((cls, i) => (
        <div key={i} className={cn('w-[12px] h-[12px] rounded-sm border', cls)} />
      ))}
      <span>Mehr</span>
      <span className="ml-auto font-mono">
        {dates.reduce((s, d) => s + d.messageCount, 0).toLocaleString('de-DE')} Nachrichten · {dates.length} Tage
      </span>
    </div>
  )
}
