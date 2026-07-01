import type { DateStats } from '@/app/newspaper/lib/types'
import { addDaysToDateKey, getNewspaperDateKey } from '@/app/newspaper/lib/timezone'

export type UserRange = 'day' | '7d' | '30d' | 'all'

export interface RangeMetrics {
  totalMessages: number
  totalDays: number
  uniqueUsersSum: number
  avgPerDay: number
  peakDay: DateStats | null
  quietDay: DateStats | null
  from: string
  to: string
}

export function filterDatesLastNDays(dates: DateStats[], days: number): DateStats[] {
  if (days <= 0 || dates.length === 0) return dates
  const cutoff = addDaysToDateKey(getNewspaperDateKey(), -(days - 1))
  return dates.filter(d => d.date >= cutoff)
}

export function getRangeBounds(range: UserRange, date?: string | null): { from: string; to: string } {
  const today = getNewspaperDateKey()
  if (range === 'day' && date) return { from: date, to: date }
  if (range === '7d') return { from: addDaysToDateKey(today, -6), to: today }
  if (range === '30d') return { from: addDaysToDateKey(today, -29), to: today }
  return { from: '1970-01-01', to: today }
}

export function filterDatesByBounds(
  dates: DateStats[],
  from: string,
  to: string
): DateStats[] {
  return dates.filter(d => d.date >= from && d.date <= to)
}

export function computeRangeMetrics(dates: DateStats[]): RangeMetrics {
  if (dates.length === 0) {
    return {
      totalMessages: 0,
      totalDays: 0,
      uniqueUsersSum: 0,
      avgPerDay: 0,
      peakDay: null,
      quietDay: null,
      from: '',
      to: ''
    }
  }

  const sorted = [...dates].sort((a, b) => a.date.localeCompare(b.date))
  const totalMessages = dates.reduce((s, d) => s + d.messageCount, 0)
  const peakDay = dates.reduce((p, d) => (d.messageCount > (p?.messageCount ?? 0) ? d : p), dates[0])
  const activeDays = dates.filter(d => d.messageCount > 0)
  const quietDay = activeDays.reduce(
    (q, d) => (d.messageCount < (q?.messageCount ?? Infinity) ? d : q),
    activeDays[0] ?? null
  )

  return {
    totalMessages,
    totalDays: dates.length,
    uniqueUsersSum: dates.reduce((s, d) => s + d.uniqueUsers, 0),
    avgPerDay: Math.round(totalMessages / dates.length),
    peakDay,
    quietDay,
    from: sorted[0].date,
    to: sorted[sorted.length - 1].date
  }
}

export function chartSeriesFromDates(dates: DateStats[]) {
  return [...dates]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({
      date: d.date,
      label: new Date(`${d.date}T12:00:00`).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: 'short'
      }),
      messages: d.messageCount,
      users: d.uniqueUsers
    }))
}
