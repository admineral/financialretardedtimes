/**
 * Client helpers shared by the export and people pages: talk to
 * POST /api/chat-activity, turn its day buckets into ListedMessage[],
 * resolve avatars, trigger downloads. Browser-only (uses fetch/DOM).
 */

import { format, subDays } from 'date-fns'
import { mergeListedMessages } from './messages'
import type { ActivityMessage, ListedMessage } from './types'

export interface ActivityDayBucket {
  date: string
  count: number
  messages?: ActivityMessage[]
  fromCache?: boolean
}

export interface ActivityResponse {
  activities: ActivityDayBucket[]
  room: string
  username: string
  totalDays: number
  totalMessages: number
  cachedCount: number
  fetchedCount: number
  cacheOnly?: boolean
  allCached?: boolean
}

export interface ActivityRequest {
  room: string
  username: string
  days?: number
  /** Only read what the database already has; never hit TradingView. */
  cacheOnly?: boolean
  /** With cacheOnly: ignore the day window and return every cached day. */
  allCached?: boolean
  /** Fill missing/stale days from TradingView. */
  forceRefresh?: boolean
  signal?: AbortSignal
}

export class PartialActivityError extends Error {
  constructor(message: string, readonly partial: ActivityDayBucket[]) {
    super(message)
    this.name = 'PartialActivityError'
  }
}

export async function fetchActivity(request: ActivityRequest): Promise<ActivityResponse> {
  const { signal, ...body } = request
  const response = await fetch('/api/chat-activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const partial = Array.isArray(data?.partialData?.activities) ? data.partialData.activities : null
    if (partial) throw new PartialActivityError(data?.error ?? 'Nur teilweise geladen', partial)
    throw new Error(data?.error ?? `Abruf fehlgeschlagen (${response.status})`)
  }
  return data as ActivityResponse
}

/** Berlin-agnostic rolling window of the last `days` calendar days, newest first. */
export function windowDates(days: number): string[] {
  const today = new Date()
  return Array.from({ length: days }, (_, i) => format(subDays(today, i), 'yyyy-MM-dd'))
}

export function messagesFromActivities(username: string, activities: ActivityDayBucket[]): ListedMessage[] {
  return mergeListedMessages({
    username,
    historyDays: activities.map(day => ({ date: day.date, messages: day.messages || [] })),
    live: []
  })
}

export function resolveAvatar(raw: string | null | undefined, username: string, size: 50 | 200 = 50): string {
  let url = (raw || '').trim()
  if (url.startsWith('//')) url = `https:${url}`
  if (!url) url = `https://s3.tradingview.com/userpics/${username.toLowerCase()}_${size}.png`
  if (url.includes('s3.tradingview.com/')) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`
  }
  return url
}

export async function fetchAvatar(username: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch(`/Test/api/user-profile?username=${encodeURIComponent(username)}`, { signal })
    if (!response.ok) return null
    const data = await response.json()
    const url = typeof data?.avatar === 'string' ? data.avatar.trim() : ''
    return url || null
  } catch {
    return null
  }
}

export function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** Only letters, digits, `_`, `-`, `.`: what TradingView allows in handles. */
export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@/, '').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40)
}
