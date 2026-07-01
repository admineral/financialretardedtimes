import { format, isToday, isYesterday } from 'date-fns'

/** Convert a TradingView unix-seconds timestamp string into a Date. */
export function unixToDate(timeStr: string): Date | null {
  const seconds = parseFloat(timeStr)
  if (!Number.isFinite(seconds)) return null
  const date = new Date(seconds * 1000)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Full message timestamp, e.g. "27 Sep 2025, 14:32". */
export function formatMessageTime(timeStr: string): string {
  const date = unixToDate(timeStr)
  return date ? format(date, 'dd MMM yyyy, HH:mm') : timeStr
}

/** Short label for a day: Today / Yesterday / "September 27, 2025". */
export function formatDateLabel(date: Date): string {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'PPP')
}

/** Month + year, e.g. "Sep 2025". */
export function formatMonthYear(dateString: string | null): string {
  if (!dateString) return 'Unknown'
  const date = new Date(dateString)
  return Number.isNaN(date.getTime()) ? 'Unknown' : format(date, 'MMM yyyy')
}

/** Locale-aware number formatting, safely handles null/undefined. */
export function formatCount(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString()
}

export function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, '0')}:00`
}

/** Human friendly relative time from a past timestamp. */
export function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}
