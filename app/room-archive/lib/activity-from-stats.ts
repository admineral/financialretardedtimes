/**
 * Build daily activity chart buckets from pre-aggregated date counts (no DB scan).
 */

import type { DateStats } from '@/app/newspaper/lib/types'

export interface ActivityBucket {
  hour: number
  label: string
  count: number
  uniqueUsers: number
  intensity: number
}

export interface ActivityFromStatsResult {
  mode: 'daily'
  buckets: ActivityBucket[]
  totalMessages: number
  peakIndex: number
  peakLabel: string
  peakCount: number
  from: string
  to: string
  dayCount: number
  source: 'date_stats'
}

export function buildDailyActivityFromStats(rangeDates: DateStats[]): ActivityFromStatsResult | null {
  if (rangeDates.length === 0) return null

  const sorted = [...rangeDates].sort((a, b) => a.date.localeCompare(b.date))
  const buckets: ActivityBucket[] = sorted.map((day, index) => ({
    hour: index,
    label: day.date,
    count: day.messageCount,
    uniqueUsers: day.uniqueUsers,
    intensity: 0
  }))

  const totalMessages = buckets.reduce((sum, b) => sum + b.count, 0)
  const maxCount = Math.max(...buckets.map(b => b.count), 1)

  for (const bucket of buckets) {
    bucket.intensity = bucket.count / maxCount
  }

  const peakBucket = buckets.reduce(
    (peak, bucket) => (bucket.count > peak.count ? bucket : peak),
    buckets[0]
  )

  return {
    mode: 'daily',
    buckets,
    totalMessages,
    peakIndex: peakBucket.hour,
    peakLabel: peakBucket.label,
    peakCount: peakBucket.count,
    from: sorted[0].date,
    to: sorted[sorted.length - 1].date,
    dayCount: sorted.length,
    source: 'date_stats'
  }
}

/** Ranges longer than a week use daily counts only (instant, no message scan). */
export function shouldUseCountsOnlyActivity(dayCount: number): boolean {
  return dayCount > 7
}
