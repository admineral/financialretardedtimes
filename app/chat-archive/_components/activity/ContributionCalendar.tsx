'use client'

import { useMemo } from 'react'
import { addDays, format, isAfter, isSameDay, startOfDay, startOfWeek, subDays } from 'date-fns'
import { cn } from '@/lib/utils'
import type { ActivityData } from '../../_lib/types'

interface ContributionCalendarProps {
  activities: ActivityData[]
  windowDays: number
  selectedDate: Date
  onSelectDate: (date: Date) => void
  isLoading?: boolean
  className?: string
}

interface DayCell {
  date: Date
  key: string
  count: number
  inRange: boolean
}

const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

function level(count: number, max: number): number {
  if (count <= 0) return 0
  if (max <= 0) return 0
  const ratio = count / max
  if (ratio > 0.66) return 4
  if (ratio > 0.33) return 3
  if (ratio > 0.1) return 2
  return 1
}

const LEVEL_CLASS = [
  'bg-muted/50',
  'bg-emerald-900/60',
  'bg-emerald-700',
  'bg-emerald-500',
  'bg-emerald-400',
]

export function ContributionCalendar({
  activities,
  windowDays,
  selectedDate,
  onSelectDate,
  isLoading,
  className,
}: ContributionCalendarProps) {
  const { weeks, maxCount } = useMemo(() => {
    const countByDate = new Map<string, number>()
    for (const a of activities) countByDate.set(a.date, a.count)

    const today = startOfDay(new Date())
    const rangeStart = subDays(today, windowDays - 1)
    const gridStart = startOfWeek(rangeStart, { weekStartsOn: 0 })

    const result: DayCell[][] = []
    let max = 0
    let cursor = gridStart

    while (cursor <= today) {
      const week: DayCell[] = []
      for (let d = 0; d < 7; d++) {
        const key = format(cursor, 'yyyy-MM-dd')
        const inRange = !isAfter(cursor, today) && !isAfter(rangeStart, cursor)
        const count = inRange ? countByDate.get(key) ?? 0 : 0
        if (count > max) max = count
        week.push({ date: cursor, key, count, inRange })
        cursor = addDays(cursor, 1)
      }
      result.push(week)
    }
    return { weeks: result, maxCount: max }
  }, [activities, windowDays])

  const monthLabels = useMemo(() => {
    let lastMonth = -1
    return weeks.map((week) => {
      const firstInRange = week.find((c) => c.inRange) ?? week[0]
      const month = firstInRange.date.getMonth()
      if (month !== lastMonth) {
        lastMonth = month
        return format(firstInRange.date, 'MMM')
      }
      return ''
    })
  }, [weeks])

  return (
    <div className={cn('w-full', className)}>
      <div className="overflow-x-auto pb-2">
        <div className="inline-flex gap-2">
          {/* Weekday labels */}
          <div className="flex flex-col gap-[3px] pt-[18px]">
            {WEEKDAY_LABELS.map((label, i) => (
              <div
                key={i}
                className="h-[13px] text-[9px] leading-[13px] text-muted-foreground"
                style={{ width: 24 }}
              >
                {label}
              </div>
            ))}
          </div>

          <div>
            {/* Month labels */}
            <div className="mb-1 flex gap-[3px]">
              {monthLabels.map((label, i) => (
                <div key={i} className="w-[13px] text-[9px] text-muted-foreground">
                  {label}
                </div>
              ))}
            </div>

            {/* Week columns */}
            <div className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((cell) => {
                    if (!cell.inRange) {
                      return <div key={cell.key} className="h-[13px] w-[13px]" />
                    }
                    const isSelected = isSameDay(cell.date, selectedDate)
                    return (
                      <button
                        key={cell.key}
                        type="button"
                        onClick={() => onSelectDate(cell.date)}
                        title={`${format(cell.date, 'PPP')} — ${cell.count} messages`}
                        aria-label={`${format(cell.date, 'PPP')}, ${cell.count} messages`}
                        className={cn(
                          'h-[13px] w-[13px] rounded-[3px] transition-colors hover:ring-1 hover:ring-primary/50',
                          LEVEL_CLASS[level(cell.count, maxCount)],
                          isSelected && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                          isLoading && cell.count === 0 && 'animate-pulse'
                        )}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
        <span>Less</span>
        {LEVEL_CLASS.map((cls, i) => (
          <span key={i} className={cn('h-[11px] w-[11px] rounded-[2px]', cls)} />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}
