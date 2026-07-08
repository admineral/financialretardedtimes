/**
 * context.ts (Newspaper edition v3 — context assembly)
 *
 * Gathers everything the mega tri-edition generation needs, in one pass:
 *
 * - The FULL last 14 Berlin days of raw chat (no AI compaction). If the
 *   char budget is exceeded, the OLDEST days are deterministically
 *   downsampled (evenly spaced messages), the newest days stay untouched.
 * - Deterministic market data (EditionData): BTC candles per genui range,
 *   Fear & Greed history, sentiment buckets, per-day activity,
 *   prediction recap — the model reads these, the UI binds them to
 *   dataComponent blocks. The model never invents numbers.
 * - Leaderboard raw material (calls + OHLC prompt from chart-leader).
 * - Activity buckets per timeline mode (24h/3d/7d) for the strip UI.
 * - Active chatters + avatar map for byline/contributor enrichment.
 */

import type { createClient } from '@/lib/supabase/server'
import {
  buildLeaderboardUserPrompt,
  fetchLeaderboardMessagesForRange,
  fetchLeaderboardOHLC,
  sampleLeaderboardMessages,
  type LeaderboardChatMessage,
  type OHLCData
} from '@/app/chart-leader/lib/analysis'
import {
  addDaysToDateKey,
  getNewspaperDateKey,
  getNewspaperDayBounds,
  NEWSPAPER_TIME_ZONE
} from '../lib/timezone'
import { fetchMessagesForRange, type V2ChatMessage } from '../v2/lib/daily-digest'
import { fetchBTCContext, type V2BTCContext } from '../v2/lib/context'
import {
  EDITION_CHAT_CHAR_BUDGET,
  EDITION_CHART_RANGES,
  EDITION_PROTECTED_RECENT_DAYS,
  EDITION_WINDOW_DAYS,
  type EditionActiveChatter,
  type EditionActivityBucket,
  type EditionActivityStats,
  type EditionCandle,
  type EditionChartRange,
  type EditionData,
  type EditionDayRange,
  type EditionFearGreedPoint,
  type EditionSentimentPoint
} from './types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>
export type EditionChatMessage = V2ChatMessage

const TIMEZONE = NEWSPAPER_TIME_ZONE

// ═══════════════════════════════════════════════════════════════════════
// Date helpers
// ═══════════════════════════════════════════════════════════════════════

/** Berlin day keys of the window, oldest first, ending at anchorDate. */
export function getEditionDateKeys(anchorDate: string, days = EDITION_WINDOW_DAYS): string[] {
  const keys: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    keys.push(addDaysToDateKey(anchorDate, -i))
  }
  return keys
}

/** The day keys a given day-range edition covers (ending at anchor). */
export function getRangeDateKeys(anchorDate: string, dayRange: EditionDayRange): string[] {
  return getEditionDateKeys(anchorDate, dayRange)
}

// ═══════════════════════════════════════════════════════════════════════
// Raw chat window (untruncated, budget-guarded downsampling)
// ═══════════════════════════════════════════════════════════════════════

export interface EditionChatDay {
  dateKey: string
  messages: EditionChatMessage[]
  totalMessages: number
  sampled: boolean
}

function formatChatLine(message: EditionChatMessage): string {
  const time = new Date(message.time)
  const berlinTime = time.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIMEZONE
  })
  return `[${time.toISOString()} | Berlin ${berlinTime} | @${message.username} | mod=${Boolean(message.is_moderator)}] ${message.text}`
}

function dayCharSize(messages: EditionChatMessage[]): number {
  return messages.reduce((sum, m) => sum + m.text.length + 70, 0)
}

/** Evenly spaced sample keeping first/last messages of the day. */
function sampleEvenly(messages: EditionChatMessage[], target: number): EditionChatMessage[] {
  if (messages.length <= target || target < 2) return messages
  const step = (messages.length - 1) / (target - 1)
  const picked: EditionChatMessage[] = []
  for (let i = 0; i < target; i++) {
    picked.push(messages[Math.round(i * step)])
  }
  return Array.from(new Set(picked))
}

/**
 * Groups messages by Berlin day and enforces the char budget by
 * downsampling the OLDEST days first. The most recent
 * EDITION_PROTECTED_RECENT_DAYS days are never touched.
 */
export function buildChatDays(
  dateKeys: string[],
  messages: EditionChatMessage[],
  charBudget = EDITION_CHAT_CHAR_BUDGET
): EditionChatDay[] {
  const byDay = new Map<string, EditionChatMessage[]>()
  for (const key of dateKeys) byDay.set(key, [])
  for (const message of messages) {
    const key = getNewspaperDateKey(new Date(message.time))
    byDay.get(key)?.push(message)
  }

  const days: EditionChatDay[] = dateKeys.map(dateKey => {
    const dayMessages = byDay.get(dateKey) ?? []
    return { dateKey, messages: dayMessages, totalMessages: dayMessages.length, sampled: false }
  })

  let totalChars = days.reduce((sum, day) => sum + dayCharSize(day.messages), 0)
  if (totalChars <= charBudget) return days

  const protectedFrom = days.length - EDITION_PROTECTED_RECENT_DAYS
  for (let i = 0; i < protectedFrom && totalChars > charBudget; i++) {
    const day = days[i]
    if (day.messages.length === 0) continue
    const before = dayCharSize(day.messages)
    // Older days shrink harder (oldest keeps ~25%, newest unprotected ~60%).
    const keepRatio = 0.25 + 0.35 * (i / Math.max(protectedFrom - 1, 1))
    const target = Math.max(40, Math.floor(day.messages.length * keepRatio))
    if (target >= day.messages.length) continue
    day.messages = sampleEvenly(day.messages, target)
    day.sampled = true
    totalChars -= before - dayCharSize(day.messages)
  }

  return days
}

export function formatRawChatSection(days: EditionChatDay[]): string {
  const total = days.reduce((sum, day) => sum + day.messages.length, 0)
  const lines: string[] = [
    `<chat-history timezone="Europe/Berlin" days="${days.length}" messages="${total}" order="aeltester Tag zuerst">`
  ]

  for (const day of days) {
    const label = new Date(`${day.dateKey}T12:00:00`).toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      timeZone: TIMEZONE
    })
    const attrs = day.sampled
      ? ` sampling="repraesentative Auswahl (${day.messages.length} von ${day.totalMessages})"`
      : ''
    lines.push(`<day date="${day.dateKey}" label="${label}" messages="${day.totalMessages}"${attrs}>`)
    if (day.messages.length === 0) {
      lines.push('[keine Nachrichten]')
    } else {
      for (const message of day.messages) {
        lines.push(formatChatLine(message))
      }
    }
    lines.push('</day>')
  }

  lines.push('</chat-history>')
  return lines.join('\n')
}

// ═══════════════════════════════════════════════════════════════════════
// Candles (1H for short ranges, 4H for long) → per-genui-range series
// ═══════════════════════════════════════════════════════════════════════

type RawCandle = EditionCandle
type BinanceKline = [number, string, string, string, string, ...unknown[]]

function normalizeRawCandles(candles: RawCandle[]): RawCandle[] {
  return candles
    .map(candle => ({
      timestamp: Number(candle.timestamp),
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close)
    }))
    .filter(candle =>
      Number.isFinite(candle.timestamp) &&
      Number.isFinite(candle.open) &&
      Number.isFinite(candle.high) &&
      Number.isFinite(candle.low) &&
      Number.isFinite(candle.close)
    )
    .sort((a, b) => a.timestamp - b.timestamp)
}

async function fetchCandlesFromBinance(timeframe: '1H' | '4H'): Promise<RawCandle[]> {
  const interval = timeframe === '1H' ? '1h' : '4h'
  const mirrors = [
    `https://api1.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=1000`,
    `https://api2.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=1000`,
    `https://api3.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=1000`,
    `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=1000`
  ]

  for (const url of mirrors) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) continue
      const raw: BinanceKline[] = await res.json()
      return normalizeRawCandles(raw.map(k => ({
        timestamp: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4])
      })))
    } catch {
      continue
    }
  }
  return []
}

async function fetchCandlesFromKraken(timeframe: '1H' | '4H'): Promise<RawCandle[]> {
  const interval = timeframe === '1H' ? 60 : 240
  const since = Math.floor((Date.now() - 45 * 24 * 60 * 60 * 1000) / 1000)
  const url = `https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=${interval}&since=${since}`

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
    if (!res.ok) return []

    const json = await res.json()
    if (Array.isArray(json.error) && json.error.length > 0) return []

    const pairData: (string | number)[][] = json.result?.XXBTZUSD ?? json.result?.XBTUSD ?? []
    if (!Array.isArray(pairData)) return []

    return normalizeRawCandles(pairData.map(k => ({
      timestamp: Number(k[0]) * 1000,
      open: parseFloat(String(k[1])),
      high: parseFloat(String(k[2])),
      low: parseFloat(String(k[3])),
      close: parseFloat(String(k[4]))
    })))
  } catch {
    return []
  }
}

async function fetchCachedCandles(
  supabase: SupabaseServerClient,
  timeframe: '1H' | '4H',
  /** Cache must contain a candle at/after this instant, else it is stale. */
  minNewestMs?: number
): Promise<RawCandle[]> {
  try {
    const { data } = await supabase
      .from('chart_timeline_ohlc_cache')
      .select('candles')
      .eq('timeframe', timeframe)
      .single()
    if (data?.candles && Array.isArray(data.candles) && data.candles.length > 0) {
      const candles = normalizeRawCandles(data.candles as RawCandle[])
      const newest = Math.max(...candles.map(c => c.timestamp))
      if (minNewestMs === undefined || newest >= minNewestMs) {
        return candles
      }
      console.warn(`[EDITION-CONTEXT] ${timeframe} candle cache stale (newest ${new Date(newest).toISOString()}), falling back to Binance`)
    }
  } catch {
    // fall through to Binance
  }

  const binanceCandles = await fetchCandlesFromBinance(timeframe)
  if (binanceCandles.length > 0) return binanceCandles

  return fetchCandlesFromKraken(timeframe)
}

const RANGE_CONFIG: Record<EditionChartRange, { hours: number; timeframe: '1H' | '4H' }> = {
  '24h': { hours: 24, timeframe: '1H' },
  '3d': { hours: 72, timeframe: '1H' },
  '7d': { hours: 168, timeframe: '4H' },
  '14d': { hours: 336, timeframe: '4H' }
}

export async function fetchCandlesByRange(
  supabase: SupabaseServerClient,
  anchorEnd: Date
): Promise<Record<EditionChartRange, EditionCandle[]>> {
  const endMs = anchorEnd.getTime()
  // Allow up to 3 intervals of lag before treating the cache as stale.
  const [hourly, fourHourly] = await Promise.all([
    fetchCachedCandles(supabase, '1H', endMs - 3 * 60 * 60 * 1000),
    fetchCachedCandles(supabase, '4H', endMs - 12 * 60 * 60 * 1000)
  ])

  const result = {} as Record<EditionChartRange, EditionCandle[]>
  for (const range of EDITION_CHART_RANGES) {
    const { hours, timeframe } = RANGE_CONFIG[range]
    const source = timeframe === '1H' ? hourly : fourHourly
    const cutoff = endMs - hours * 60 * 60 * 1000
    result[range] = source.filter(c => c.timestamp >= cutoff && c.timestamp <= endMs)
  }
  return result
}

// ═══════════════════════════════════════════════════════════════════════
// Fear & Greed history / sentiment buckets / predictions
// ═══════════════════════════════════════════════════════════════════════

async function fetchFearGreedHistory(
  supabase: SupabaseServerClient,
  days: number
): Promise<EditionFearGreedPoint[]> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('fear_greed_history')
    .select('created_at, today_index, today_classification_de, trend, insight')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(120)

  if (error || !data) return []
  return data.map(row => ({
    createdAt: row.created_at,
    todayIndex: row.today_index,
    todayClassificationDE: row.today_classification_de,
    trend: row.trend,
    insight: row.insight
  }))
}

async function fetchSentimentSeries(
  supabase: SupabaseServerClient
): Promise<EditionSentimentPoint[]> {
  try {
    const { data } = await supabase
      .from('sentiment_analysis_cache')
      .select('data')
      .eq('cache_key', 'sentiment_7d_4h')
      .single()

    const payload = data?.data as {
      buckets?: Array<{
        timestamp: string
        netSentiment: number
        messageCount: number
        priceAtBucket?: number
      }>
    } | null

    if (!payload?.buckets) return []
    return payload.buckets.map(bucket => ({
      timestamp: bucket.timestamp,
      netSentiment: bucket.netSentiment,
      messageCount: bucket.messageCount,
      priceAtBucket: bucket.priceAtBucket ?? null
    }))
  } catch {
    return []
  }
}

async function fetchPredictions(
  supabase: SupabaseServerClient
): Promise<EditionData['predictions']> {
  try {
    const { data } = await supabase
      .from('prediction_analysis_cache')
      .select('data, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const payload = data?.data as {
      predictions?: EditionData['predictions']['items']
      summary?: string
    } | null
    if (!payload?.predictions) return { items: [], summary: null, updatedAt: null }

    return {
      items: payload.predictions.map(p => ({
        username: p.username,
        prediction: p.prediction,
        direction: p.direction,
        targetPrice: p.targetPrice ?? null,
        targetDateText: p.targetDateText,
        priceAtPrediction: p.priceAtPrediction,
        timestamp: p.timestamp,
        confidence: p.confidence
      })),
      summary: payload.summary ?? null,
      updatedAt: data?.updated_at ?? null
    }
  } catch {
    return { items: [], summary: null, updatedAt: null }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Deterministic activity (per-day series + timeline strip buckets)
// ═══════════════════════════════════════════════════════════════════════

function closestClose(candles: EditionCandle[], dateKey: string): number | null {
  const dayEnd = getNewspaperDayBounds(dateKey).endDate.getTime()
  let best: EditionCandle | null = null
  for (const candle of candles) {
    if (candle.timestamp <= dayEnd && (!best || candle.timestamp > best.timestamp)) {
      best = candle
    }
  }
  return best ? best.close : null
}

export function buildActivitySeries(
  dateKeys: string[],
  days: EditionChatDay[],
  candles14d: EditionCandle[]
): EditionData['activitySeries'] {
  const byKey = new Map(days.map(day => [day.dateKey, day]))
  return dateKeys.map(dateKey => {
    const day = byKey.get(dateKey)
    const users = new Set((day?.messages ?? []).map(m => m.username))
    return {
      date: dateKey,
      messageCount: day?.totalMessages ?? 0,
      uniqueUsers: users.size,
      btcClose: closestClose(candles14d, dateKey)
    }
  })
}

export type TimelineMode = '24h' | '3d' | '7d'

function getIntervalMs(mode: TimelineMode): number {
  if (mode === '24h') return 60 * 60 * 1000
  if (mode === '3d') return 2 * 60 * 60 * 1000
  return 4 * 60 * 60 * 1000
}

function getIntervalLabel(mode: TimelineMode): string {
  if (mode === '24h') return 'hour'
  if (mode === '3d') return '2hour'
  return '4hour'
}

function formatBucketLabel(timestamp: Date, mode: TimelineMode): string {
  const hour = timestamp.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIMEZONE
  })
  if (mode === '24h') return hour
  const day = timestamp.toLocaleDateString('de-DE', { weekday: 'short', timeZone: TIMEZONE })
  return `${day} ${hour}`
}

export function dayRangeToTimelineMode(dayRange: EditionDayRange): TimelineMode {
  return dayRange === 1 ? '24h' : dayRange === 3 ? '3d' : '7d'
}

export function computeActivityBuckets(
  messages: EditionChatMessage[],
  range: { startDate: Date; endDate: Date },
  mode: TimelineMode
): { buckets: EditionActivityBucket[]; stats: EditionActivityStats | null } {
  const intervalMs = getIntervalMs(mode)
  const bucketMap = new Map<number, { count: number; users: Set<string> }>()
  const bucketStart = Math.floor(range.startDate.getTime() / intervalMs) * intervalMs
  const bucketEnd = Math.ceil(range.endDate.getTime() / intervalMs) * intervalMs

  for (let ts = bucketStart; ts <= bucketEnd; ts += intervalMs) {
    bucketMap.set(ts, { count: 0, users: new Set() })
  }

  const inRange = messages.filter(m => {
    const t = new Date(m.time).getTime()
    return t >= range.startDate.getTime() && t <= range.endDate.getTime()
  })

  for (const message of inRange) {
    const bucketTs = Math.floor(new Date(message.time).getTime() / intervalMs) * intervalMs
    const bucket = bucketMap.get(bucketTs)
    if (bucket) {
      bucket.count++
      bucket.users.add(message.username)
    }
  }

  const counts = Array.from(bucketMap.values()).map(b => b.count)
  const nonZero = counts.filter(c => c > 0)
  const maxCount = Math.max(...counts, 0)
  const avgCount = nonZero.length > 0 ? nonZero.reduce((s, c) => s + c, 0) / nonZero.length : 0

  let peakTs = 0
  let peakCount = 0
  let quietTs = 0
  let quietCount = Infinity
  for (const [ts, bucket] of bucketMap) {
    if (bucket.count > peakCount) {
      peakCount = bucket.count
      peakTs = ts
    }
    if (bucket.count > 0 && bucket.count < quietCount) {
      quietCount = bucket.count
      quietTs = ts
    }
  }

  const buckets = Array.from(bucketMap.entries())
    .map(([ts, bucket]) => ({
      timestamp: new Date(ts).toISOString(),
      label: formatBucketLabel(new Date(ts), mode),
      count: bucket.count,
      uniqueUsers: bucket.users.size,
      intensity: maxCount > 0 ? bucket.count / maxCount : 0
    }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  const allUsers = new Set(inRange.map(m => m.username))

  return {
    buckets,
    stats: {
      totalMessages: inRange.length,
      totalUsers: allUsers.size,
      avgPerBucket: Math.round(avgCount * 10) / 10,
      maxPerBucket: maxCount,
      peakTime: peakTs ? formatBucketLabel(new Date(peakTs), mode) : '',
      quietTime: quietTs ? formatBucketLabel(new Date(quietTs), mode) : '',
      mode,
      interval: getIntervalLabel(mode),
      startDate: range.startDate.toISOString(),
      endDate: range.endDate.toISOString()
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Active chatters / avatars
// ═══════════════════════════════════════════════════════════════════════

export function buildActiveChatters(messages: EditionChatMessage[]): {
  userAvatarMap: Map<string, string>
  activeChatters: EditionActiveChatter[]
} {
  const userAvatarMap = new Map<string, string>()
  const counts = new Map<string, number>()

  for (const message of messages) {
    if (message.user_pic && !userAvatarMap.has(message.username)) {
      userAvatarMap.set(message.username, message.user_pic)
    }
    counts.set(message.username, (counts.get(message.username) || 0) + 1)
  }

  const activeChatters = Array.from(counts.entries())
    .map(([username, messageCount]) => ({
      username,
      avatar: userAvatarMap.get(username),
      messageCount
    }))
    .sort((a, b) => b.messageCount - a.messageCount)
    .slice(0, 10)

  return { userAvatarMap, activeChatters }
}

// ═══════════════════════════════════════════════════════════════════════
// Full input bundle for one generation run
// ═══════════════════════════════════════════════════════════════════════

export interface EditionGenerationInputs {
  anchorDate: string
  dateKeys: string[]
  chatDays: EditionChatDay[]
  messages: EditionChatMessage[]
  data: EditionData
  btcContext: V2BTCContext | null
  leaderboardMessages: LeaderboardChatMessage[]
  leaderboardOhlc: OHLCData[]
  leaderboardPrompt: string
  userAvatarMap: Map<string, string>
  activeChatters: EditionActiveChatter[]
  windowStart: Date
  windowEnd: Date
}

/**
 * @param anchorDate  Berlin day key the editions end at (today for live
 *                    generation, a past key for archive re-generation).
 */
export async function prepareEditionInputs(
  supabase: SupabaseServerClient,
  anchorDate: string = getNewspaperDateKey()
): Promise<EditionGenerationInputs> {
  const dateKeys = getEditionDateKeys(anchorDate)
  const windowStart = getNewspaperDayBounds(dateKeys[0]).startDate
  const isToday = anchorDate === getNewspaperDateKey()
  const windowEnd = isToday ? new Date() : getNewspaperDayBounds(anchorDate).endDate

  const [messages, candlesByRange, fearGreedHistory, sentimentSeries, predictions, btcContext, leaderboardFetch, leaderboardOhlc] =
    await Promise.all([
      fetchMessagesForRange(supabase, windowStart, windowEnd),
      fetchCandlesByRange(supabase, windowEnd),
      fetchFearGreedHistory(supabase, EDITION_WINDOW_DAYS),
      fetchSentimentSeries(supabase),
      fetchPredictions(supabase),
      fetchBTCContext(),
      fetchLeaderboardMessagesForRange(supabase, windowStart, windowEnd),
      fetchLeaderboardOHLC(supabase, EDITION_WINDOW_DAYS)
    ])

  const chatDays = buildChatDays(dateKeys, messages)
  const { userAvatarMap, activeChatters } = buildActiveChatters(messages)

  const candles14d = candlesByRange['14d']
  const lastCandle = candles14d[candles14d.length - 1]
  const firstCandle = candles14d[0]

  const activitySeries = buildActivitySeries(dateKeys, chatDays, candles14d)
  const busiest = [...activitySeries].sort((a, b) => b.messageCount - a.messageCount)[0]
  const uniqueUsers = new Set(messages.map(m => m.username)).size

  const data: EditionData = {
    window: { startDate: dateKeys[0], endDate: anchorDate, days: dateKeys.length },
    btc: {
      candlesByRange,
      currentPrice: btcContext?.currentPrice ?? (lastCandle ? lastCandle.close : null),
      change14d: firstCandle && lastCandle
        ? Math.round(((lastCandle.close - firstCandle.open) / firstCandle.open) * 10000) / 100
        : null
    },
    fearGreedHistory,
    sentimentSeries,
    activitySeries,
    predictions,
    totals: {
      messageCount: messages.length,
      uniqueUsers,
      busiestDay: busiest && busiest.messageCount > 0 ? busiest.date : null
    }
  }

  const leaderboardMessages = sampleLeaderboardMessages(leaderboardFetch.messages, 1500)
  const leaderboardPrompt = buildLeaderboardUserPrompt({
    messages: leaderboardMessages,
    ohlcData: leaderboardOhlc,
    from: windowStart.toISOString(),
    to: windowEnd.toISOString(),
    daysBack: EDITION_WINDOW_DAYS,
    today: anchorDate
  })

  return {
    anchorDate,
    dateKeys,
    chatDays,
    messages,
    data,
    btcContext,
    leaderboardMessages,
    leaderboardOhlc,
    leaderboardPrompt,
    userAvatarMap,
    activeChatters,
    windowStart,
    windowEnd
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Market section formatter (one <market> block for the prompt)
// ═══════════════════════════════════════════════════════════════════════

function formatCandles(candles: EditionCandle[], label: string): string {
  if (candles.length === 0) return `## ${label}\nKeine Kerzendaten verfuegbar.`
  const lines = candles.map(candle => {
    const date = new Date(candle.timestamp).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      timeZone: TIMEZONE
    })
    return `${date}: O ${Math.round(candle.open)} H ${Math.round(candle.high)} L ${Math.round(candle.low)} C ${Math.round(candle.close)}`
  })
  return [`## ${label} (${candles.length} Kerzen)`, ...lines].join('\n')
}

export function formatMarketSection(inputs: EditionGenerationInputs): string {
  const { btcContext, data, leaderboardPrompt } = inputs
  const lines: string[] = ['<market>']

  lines.push('## BTC aktuell')
  if (btcContext) {
    lines.push(`Preis: $${btcContext.currentPrice.toLocaleString('de-DE')} (€${btcContext.priceEUR.toLocaleString('de-DE')})`)
    lines.push(`24h: ${btcContext.change24h}% | 7d: ${btcContext.change7d}% | 30d: ${btcContext.change30d}%`)
    lines.push(`ATH: $${btcContext.athPrice.toLocaleString('de-DE')} (${btcContext.athDate})`)
  } else {
    lines.push('BTC-Kontext nicht verfuegbar.')
  }
  if (data.btc.change14d !== null) {
    lines.push(`14d Veraenderung: ${data.btc.change14d}%`)
  }

  lines.push('')
  lines.push(formatCandles(data.btc.candlesByRange['24h'], 'BTC 1H-Kerzen — letzte 24h'))
  lines.push('')
  lines.push(formatCandles(data.btc.candlesByRange['7d'], 'BTC 4H-Kerzen — letzte 7 Tage'))
  lines.push('')
  lines.push(formatCandles(data.btc.candlesByRange['14d'], 'BTC 4H-Kerzen — letzte 14 Tage'))

  lines.push('')
  lines.push('## Chat-Aktivitaet pro Tag (deterministisch gezaehlt)')
  for (const point of data.activitySeries) {
    lines.push(`${point.date}: ${point.messageCount} Nachrichten, ${point.uniqueUsers} User${point.btcClose ? ` | BTC Close $${Math.round(point.btcClose)}` : ''}`)
  }

  lines.push('')
  lines.push('## Fear & Greed Historie (Community-Index, 0=Extreme Fear, 100=Extreme Greed)')
  if (data.fearGreedHistory.length === 0) {
    lines.push('Keine Fear & Greed Historie verfuegbar.')
  } else {
    for (const point of data.fearGreedHistory) {
      const date = new Date(point.createdAt).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        timeZone: TIMEZONE
      })
      lines.push(`${date}: ${point.todayIndex} (${point.todayClassificationDE}, Trend: ${point.trend})${point.insight ? ` — "${point.insight}"` : ''}`)
    }
  }

  lines.push('')
  lines.push('## Chat-Sentiment (4h-Buckets, netSentiment -100..100)')
  if (data.sentimentSeries.length === 0) {
    lines.push('Keine Sentiment-Buckets verfuegbar.')
  } else {
    for (const point of data.sentimentSeries) {
      const date = new Date(point.timestamp).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        timeZone: TIMEZONE
      })
      lines.push(`${date}: ${point.netSentiment} (${point.messageCount} msgs)${point.priceAtBucket ? ` | BTC $${Math.round(point.priceAtBucket)}` : ''}`)
    }
  }

  lines.push('')
  lines.push('## Extrahierte Preis-Vorhersagen (Prediction Market)')
  if (data.predictions.items.length === 0) {
    lines.push('Keine Vorhersagen im Cache.')
  } else {
    if (data.predictions.summary) lines.push(`Zusammenfassung: ${data.predictions.summary}`)
    for (const item of data.predictions.items) {
      lines.push(`- @${item.username} (${item.direction}, ${item.confidence}): "${item.prediction}" | Ziel: ${item.targetPrice ? `$${item.targetPrice}` : 'n/a'} bis ${item.targetDateText} | BTC bei Call: $${Math.round(item.priceAtPrediction)} | ${item.timestamp}`)
    }
  }

  lines.push('')
  lines.push('## Trader-Leaderboard-Rohdaten (Calls mit BTC-Preis zum Zeitpunkt, letzte 14 Tage)')
  lines.push(leaderboardPrompt)

  lines.push('</market>')
  return lines.join('\n')
}
