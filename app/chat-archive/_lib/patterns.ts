import type { ActivityData, ActivityPatterns, HourCounts } from './types'
import { unixToDate } from './format'

/**
 * Derive hour-of-day activity patterns from daily activity data.
 *
 * `totalMessages` is the real total (sum of each day's `count`), while the
 * hourly distribution is inferred from the message samples we actually have.
 */
export function calculatePatterns(activities: ActivityData[]): ActivityPatterns | null {
  const hourCounts: HourCounts = {}
  for (let i = 0; i < 24; i++) hourCounts[i] = 0

  let totalMessages = 0
  let sampleMessages = 0
  let daysWithFullData = 0
  let daysWithSampleData = 0

  for (const activity of activities) {
    totalMessages += activity.count

    if (activity.messages && activity.messages.length > 0) {
      for (const message of activity.messages) {
        const date = unixToDate(message.time)
        if (date) {
          hourCounts[date.getHours()]++
          sampleMessages++
        }
      }

      if (activity.count === activity.messages.length) {
        daysWithFullData++
      } else {
        daysWithSampleData++
      }
    }
  }

  if (totalMessages === 0) return null

  const sortedHours = Object.entries(hourCounts)
    .map(([hour, count]) => ({
      hour: parseInt(hour, 10),
      count,
      percentage: sampleMessages > 0 ? (count / sampleMessages) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)

  return {
    totalMessages,
    peakHour: sortedHours[0],
    topHours: sortedHours.slice(0, 3).filter((h) => h.count > 0),
    hourCounts,
    daysWithFullData,
    daysWithSampleData,
    isComprehensive: daysWithFullData > daysWithSampleData,
  }
}

/** Number of days in the window that had at least one message. */
export function countActiveDays(activities: ActivityData[]): number {
  return activities.reduce((acc, a) => acc + (a.count > 0 ? 1 : 0), 0)
}

/** Average messages per day across the days we have data for. */
export function averagePerDay(activities: ActivityData[], totalMessages: number): number {
  if (activities.length === 0) return 0
  return Math.round(totalMessages / activities.length)
}
