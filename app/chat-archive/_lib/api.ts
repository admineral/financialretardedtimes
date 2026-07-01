import type {
  ActivityResponse,
  ChatArchiveData,
  IdeasResponse,
  Profile,
} from './types'

async function toJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body?.error || body?.details || detail
    } catch {
      // Non-JSON error body, fall back to status text.
    }
    throw new Error(detail || `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

/** Only TradingView S3 assets need the CORS-avoiding proxy. */
export function imageProxySrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  return url.includes('s3.tradingview.com')
    ? `/api/image-proxy?url=${encodeURIComponent(url)}`
    : url
}

export interface GetActivityArgs {
  room: string
  username: string
  dates: string[]
  cacheOnly?: boolean
  forceRefresh?: boolean
  signal?: AbortSignal
}

export async function getActivity({
  room,
  username,
  dates,
  cacheOnly,
  forceRefresh,
  signal,
}: GetActivityArgs): Promise<ActivityResponse> {
  const res = await fetch('/api/chat-activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room, username, dates, cacheOnly, forceRefresh }),
    signal,
  })
  return toJson<ActivityResponse>(res)
}

export async function getProfile(username: string, signal?: AbortSignal): Promise<Profile> {
  const res = await fetch(
    `/Test/api/user-profile?username=${encodeURIComponent(username)}`,
    { signal }
  )
  return toJson<Profile>(res)
}

export async function getIdeas(
  username: string,
  page: number,
  signal?: AbortSignal
): Promise<IdeasResponse> {
  const res = await fetch(
    `/Test/api/live-ideas?username=${encodeURIComponent(username)}&page=${page}`,
    { signal }
  )
  return toJson<IdeasResponse>(res)
}

export async function clearIdeasCache(username: string): Promise<void> {
  const res = await fetch(
    `/Test/api/cache?username=${encodeURIComponent(username)}`,
    { method: 'DELETE' }
  )
  if (!res.ok) throw new Error('Failed to clear ideas cache')
}

export interface ClearAllCacheResult {
  success: boolean
  totalDeleted: number
  message?: string
}

export async function clearAllCache(
  room: string,
  username: string
): Promise<ClearAllCacheResult> {
  const res = await fetch(
    `/api/cache-management?room=${encodeURIComponent(room)}&username=${encodeURIComponent(username)}`,
    { method: 'DELETE' }
  )
  return toJson<ClearAllCacheResult>(res)
}

export interface GetChatArchiveArgs {
  room: string
  date: string
  username: string
  startPage?: number
  maxPages?: number
  signal?: AbortSignal
}

export async function getChatArchive({
  room,
  date,
  username,
  startPage = 1,
  maxPages = 10,
  signal,
}: GetChatArchiveArgs): Promise<ChatArchiveData> {
  const res = await fetch('/api/chat-archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room, date, username, startPage, maxPages }),
    signal,
  })
  return toJson<ChatArchiveData>(res)
}

export function tradingViewChatUrl(room: string, date: string, username: string): string {
  return `https://de.tradingview.com/chat/history/?room=${room}&date=${date}&tzoffset=-120&usernames=${username}`
}
