import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { DailyAIResponseSchema, UNIFIED_PROMPT, type BTCContext } from './schemas'
import type {
  ArticleData,
  DailyAIResponseData,
  DailyFearGreedData,
  DailyTickerEventData,
  DailyTimelineEventData,
  NewspaperAIData,
  UnifiedNewspaperData
} from './types'
import {
  writeFearGreedCache,
  writeTickerCache,
  writeTimelineCache,
  type FearGreedDateRangeInfo,
  type TickerCacheEvent
} from './cache-writers'
import { addDaysToDateKey, getNewspaperDateKey, getNewspaperDayBounds, NEWSPAPER_TIME_ZONE } from './timezone'
import {
  buildModuleResourceFingerprint,
  createPromptProgram,
  createNewspaperIssue,
  writeNewspaperIssueCache,
  writeNewspaperModuleCache,
  type NewspaperAIUsage
} from '../engine'
import { firstPartyNewspaperModules, fearGreedModule, traderLeaderboardModule } from '../modules'
import {
  buildLeaderboardUserPrompt,
  fetchLeaderboardOHLC,
  type OHLCData
} from '@/app/chart-leader/lib/analysis'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>
type TimelineMode = '24h' | '3d' | '7d'

interface DailyAIErrorDetails {
  name?: string
  type?: string
  code?: string
  status?: number
  message: string
  userMessage: string
}

interface DailyAIUsageInput {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  cachedInputTokens?: number
  reasoningTokens?: number
  inputTokenDetails?: {
    cacheReadTokens?: number
    cacheWriteTokens?: number
  }
  outputTokenDetails?: {
    reasoningTokens?: number
  }
}

interface DailyAIResponseMetadataInput {
  modelId?: string
}

export class DailyAIProviderError extends Error {
  details: DailyAIErrorDetails
  code?: string
  status?: number

  constructor(details: DailyAIErrorDetails, cause?: unknown) {
    super(details.userMessage)
    this.name = 'DailyAIProviderError'
    this.details = details
    this.code = details.code
    this.status = details.status
    ;(this as Error & { cause?: unknown }).cause = cause
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : null
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined
}

function findProviderErrorRecord(value: unknown, seen = new Set<unknown>()): Record<string, unknown> | null {
  const record = asRecord(value)
  if (!record || seen.has(value)) return null
  seen.add(value)

  const nestedError = findProviderErrorRecord(record.error, seen)
    ?? findProviderErrorRecord(record.cause, seen)
  if (nestedError) return nestedError

  if (
    stringValue(record.code) ||
    stringValue(record.type) ||
    stringValue(record.message) ||
    numberValue(record.status) ||
    numberValue(record.statusCode)
  ) {
    return record
  }

  return null
}

function getDailyAIErrorDetails(error: unknown): DailyAIErrorDetails {
  const record = findProviderErrorRecord(error)
  const response = asRecord(record?.response)
  const code = stringValue(record?.code)
  const type = stringValue(record?.type)
  const name = error instanceof Error ? error.name : stringValue(record?.name)
  const status = numberValue(record?.status)
    ?? numberValue(record?.statusCode)
    ?? numberValue(response?.status)
  const message = stringValue(record?.message)
    ?? (error instanceof Error ? error.message : undefined)
    ?? (typeof error === 'string' ? error : undefined)
    ?? 'Daily AI generation failed'

  if (code === 'insufficient_quota' || type === 'insufficient_quota') {
    return {
      name,
      type,
      code,
      status: status ?? 429,
      message,
      userMessage: 'OpenAI quota exceeded. Check billing/plan limits or switch the API key before regenerating Daily AI.'
    }
  }

  if (code === 'rate_limit_exceeded' || type === 'rate_limit_exceeded' || status === 429) {
    return {
      name,
      type,
      code,
      status: 429,
      message,
      userMessage: 'OpenAI rate limit exceeded. Please retry the Daily AI generation shortly.'
    }
  }

  return {
    name,
    type,
    code,
    status,
    message,
    userMessage: message
  }
}

function createProviderError(details: DailyAIErrorDetails, cause: unknown): DailyAIProviderError | null {
  if (!details.code && !details.type && !details.status) return null
  return new DailyAIProviderError(details, cause)
}

function dailyAIErrorForLog(error: unknown): DailyAIErrorDetails {
  return getDailyAIErrorDetails(error)
}

function tokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function summarizeDailyAIUsage(
  usage: DailyAIUsageInput | undefined,
  response: DailyAIResponseMetadataInput | undefined
): NewspaperAIUsage | null {
  if (!usage) return null

  return {
    inputTokens: tokenCount(usage.inputTokens),
    outputTokens: tokenCount(usage.outputTokens),
    totalTokens: tokenCount(usage.totalTokens),
    cachedInputTokens: tokenCount(usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens),
    cacheWriteInputTokens: tokenCount(usage.inputTokenDetails?.cacheWriteTokens),
    reasoningTokens: tokenCount(usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens),
    modelId: response?.modelId ?? 'gpt-5.4'
  }
}

export function getDailyAIErrorResponse(error: unknown): {
  body: { error: string; code?: string }
  status: number
} {
  const details = error instanceof DailyAIProviderError
    ? error.details
    : getDailyAIErrorDetails(error)

  return {
    body: {
      error: details.userMessage,
      code: details.code
    },
    status: details.status ?? 500
  }
}

interface ChatMessage {
  username: string
  text: string
  time: string
  is_moderator?: boolean | null
  user_pic?: string | null
}

interface ActivityBucket {
  timestamp: string
  label: string
  count: number
  uniqueUsers: number
  intensity: number
}

interface ActivityStats {
  totalMessages: number
  totalUsers: number
  avgPerBucket: number
  maxPerBucket: number
  peakTime: string
  quietTime: string
  mode: string
  interval: string
  startDate: string
  endDate: string
}

interface PreviousFearGreed {
  created_at: string
  today_index: number
  today_classification_de: string
  last_3_days_index: number
  last_3_days_classification_de: string
  last_7_days_index: number
  last_7_days_classification_de: string
  trend: string
  insight: string | null
}

interface ModuleRange {
  startDate: Date
  endDate: Date
  cacheKey: string
}

export interface DailyAIRequest {
  selectedDates?: string[]
  dayRange?: number
  timelineMode?: TimelineMode
  includeNewspaper?: boolean
  includeTicker?: boolean
  includeTimeline?: boolean
  includeFearGreed?: boolean
  includeTraderLeaderboard?: boolean
  source?: 'newspaper' | 'ticker' | 'timeline' | 'fear-greed' | 'trader-leaderboard' | 'cron' | 'manual'
}

export interface DailyAIContext {
  cacheDate: string
  selectedDates: string[]
  dayRange: number
  timelineMode: TimelineMode
  modules: {
    newspaper: boolean
    ticker: boolean
    timeline: boolean
    fearGreed: boolean
    traderLeaderboard: boolean
  }
  ranges: {
    newspaper: ModuleRange | null
    ticker: ModuleRange | null
    timeline: ModuleRange | null
    fearGreed: ModuleRange | null
    traderLeaderboard: ModuleRange | null
  }
  counts: {
    newspaperMessages: number
    tickerMessages: number
    timelineMessages: number
    fearGreedMessages: number
    newspaperUsers: number
    tickerUsers: number
    timelineUsers: number
    fearGreedUsers: number
    traderLeaderboardMessages: number
    traderLeaderboardUsers: number
  }
  newspaperUserAvatarMap: Map<string, string>
  activeChatters: UnifiedNewspaperData['activeChatters']
  fearGreedDateRangeInfo: FearGreedDateRangeInfo | null
  traderLeaderboardOhlc: OHLCData[]
  timelineActivityBuckets: ActivityBucket[]
  timelineActivityStats: ActivityStats | null
}

const TIMEZONE = NEWSPAPER_TIME_ZONE

function berlinNow(): string {
  return new Date().toLocaleString('de-DE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIMEZONE
  })
}

function berlinDateString(date: Date): string {
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'short',
    timeZone: TIMEZONE
  })
}

function berlinDateTimeString(date: Date): string {
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIMEZONE
  })
}

function getRollingRange(mode: TimelineMode): { startDate: Date; endDate: Date } {
  const endDate = new Date()
  const startDate = new Date(endDate)

  if (mode === '24h') startDate.setHours(startDate.getHours() - 24)
  else if (mode === '3d') startDate.setDate(startDate.getDate() - 3)
  else startDate.setDate(startDate.getDate() - 7)

  return { startDate, endDate }
}

function getNewspaperRange(selectedDates: string[]): { startDate: Date; endDate: Date } {
  const sortedDates = [...selectedDates].sort()
  const firstDay = getNewspaperDayBounds(sortedDates[0])
  const lastDay = getNewspaperDayBounds(sortedDates[sortedDates.length - 1])

  return {
    startDate: firstDay.startDate,
    endDate: lastDay.endDate
  }
}

function getDefaultInterval(mode: TimelineMode): string {
  if (mode === '24h') return 'hour'
  if (mode === '3d') return '2hour'
  return '4hour'
}

function getIntervalMs(interval: string): number {
  if (interval === '15min') return 15 * 60 * 1000
  if (interval === '30min') return 30 * 60 * 1000
  if (interval === '2hour') return 2 * 60 * 60 * 1000
  if (interval === '4hour') return 4 * 60 * 60 * 1000
  return 60 * 60 * 1000
}

function formatBucketLabel(timestamp: Date, mode: TimelineMode): string {
  const hour = timestamp.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIMEZONE
  })

  if (mode === '24h') return hour

  const day = timestamp.toLocaleDateString('de-DE', {
    weekday: 'short',
    timeZone: TIMEZONE
  })

  return `${day} ${hour}`
}

function normalizeAIArticle(article: NewspaperAIData['featuredArticle']): ArticleData {
  return {
    ...article,
    quote: article.quote ?? undefined,
    chartImage: article.chartImage
      ? {
          url: article.chartImage.url,
          caption: article.chartImage.caption ?? undefined,
          author: article.chartImage.author ?? undefined
        }
      : undefined
  }
}

function normalizeNewspaperData(
  object: NewspaperAIData,
  userAvatarMap: Map<string, string>,
  activeChatters: UnifiedNewspaperData['activeChatters']
): UnifiedNewspaperData {
  return {
    ...object,
    topContributors: object.topContributors.map(contributor => ({
      ...contributor,
      avatar: userAvatarMap.get(contributor.username) || undefined
    })),
    featuredArticle: normalizeAIArticle(object.featuredArticle),
    secondaryArticle: normalizeAIArticle(object.secondaryArticle),
    activeChatters
  }
}

function countUniqueUsers(messages: ChatMessage[]): number {
  return new Set(messages.map(message => message.username)).size
}

function filterMessages(messages: ChatMessage[], range: ModuleRange | null): ChatMessage[] {
  if (!range) return []
  const start = range.startDate.getTime()
  const end = range.endDate.getTime()
  return messages.filter(message => {
    const time = new Date(message.time).getTime()
    return time >= start && time <= end
  })
}

async function fetchMessagesForRange(
  supabase: SupabaseServerClient,
  startDate: Date,
  endDate: Date
): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = []
  const pageSize = 1000
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase
      .from('tv_chat_messages')
      .select('username, text, time, is_moderator, user_pic')
      .gte('time', startDate.toISOString())
      .lte('time', endDate.toISOString())
      .order('time', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) {
      throw new Error(`Database error: ${error.message}`)
    }

    if (!data || data.length === 0) {
      hasMore = false
    } else {
      messages.push(...data)
      offset += pageSize
      hasMore = data.length === pageSize
    }
  }

  return messages.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
}

async function fetchBTCContext(): Promise<BTCContext | null> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false',
      { next: { revalidate: 300 } }
    )

    if (!response.ok) return null

    const data = await response.json()
    const market = data.market_data

    return {
      currentPrice: Math.round(market.current_price.usd),
      priceEUR: Math.round(market.current_price.eur),
      change24h: Math.round(market.price_change_percentage_24h * 100) / 100,
      high24h: Math.round(market.high_24h.usd),
      low24h: Math.round(market.low_24h.usd),
      volume24h: Math.round(market.total_volume.usd),
      change7d: Math.round(market.price_change_percentage_7d * 100) / 100,
      change30d: Math.round(market.price_change_percentage_30d * 100) / 100,
      athPrice: Math.round(market.ath.usd),
      athDate: market.ath_date.usd.split('T')[0],
      lastUpdated: new Date().toISOString()
    }
  } catch (error) {
    console.error('[DAILY-AI] BTC fetch failed:', error)
    return null
  }
}

function formatBTCContext(btc: BTCContext | null): string {
  if (!btc) return 'BTC context unavailable.'

  const formatPrice = (price: number) => price.toLocaleString('de-DE')
  const formatPercent = (pct: number) => (pct >= 0 ? `+${pct}%` : `${pct}%`)

  return [
    `Aktueller BTC Preis: $${formatPrice(btc.currentPrice)} (€${formatPrice(btc.priceEUR)})`,
    `24h: ${formatPercent(btc.change24h)}, 7d: ${formatPercent(btc.change7d)}, 30d: ${formatPercent(btc.change30d)}`,
    `24h Range: $${formatPrice(btc.low24h)} - $${formatPrice(btc.high24h)}`,
    `ATH: $${formatPrice(btc.athPrice)} (${btc.athDate})`
  ].join('\n')
}

async function fetchPreviousFearGreed(supabase: SupabaseServerClient): Promise<PreviousFearGreed | null> {
  const { data, error } = await supabase
    .from('fear_greed_history')
    .select('created_at, today_index, today_classification_de, last_3_days_index, last_3_days_classification_de, last_7_days_index, last_7_days_classification_de, trend, insight')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null
  return data as PreviousFearGreed
}

function formatPreviousFearGreed(prev: PreviousFearGreed | null): string {
  if (!prev) return 'Keine vorherige Fear & Greed Analyse vorhanden.'

  return [
    `Letzte Fear & Greed Analyse: ${berlinDateTimeString(new Date(prev.created_at))}`,
    `Heute: ${prev.today_index} (${prev.today_classification_de})`,
    `3 Tage: ${prev.last_3_days_index} (${prev.last_3_days_classification_de})`,
    `7 Tage: ${prev.last_7_days_index} (${prev.last_7_days_classification_de})`,
    `Trend: ${prev.trend}`,
    prev.insight ? `Insight: "${prev.insight}"` : ''
  ].filter(Boolean).join('\n')
}

function buildActiveChatters(messages: ChatMessage[]): {
  userAvatarMap: Map<string, string>
  activeChatters: UnifiedNewspaperData['activeChatters']
} {
  const userAvatarMap = new Map<string, string>()
  const userMessageCounts = new Map<string, number>()

  for (const message of messages) {
    if (message.user_pic && !userAvatarMap.has(message.username)) {
      userAvatarMap.set(message.username, message.user_pic)
    }
    userMessageCounts.set(message.username, (userMessageCounts.get(message.username) || 0) + 1)
  }

  const activeChatters = Array.from(userMessageCounts.entries())
    .map(([username, messageCount]) => ({
      username,
      avatar: userAvatarMap.get(username),
      messageCount
    }))
    .sort((a, b) => b.messageCount - a.messageCount)
    .slice(0, 10)

  return { userAvatarMap, activeChatters }
}

function extractChartUrls(messages: ChatMessage[]): Array<{ url: string; author: string; time: string }> {
  const chartUrls: Array<{ url: string; author: string; time: string }> = []
  const chartUrlRegex = /https?:\/\/(?:www\.)?tradingview\.com\/(?:x|chart)\/([A-Za-z0-9]+)/g

  for (const message of messages) {
    const matches = message.text.matchAll(chartUrlRegex)
    for (const match of matches) {
      chartUrls.push({
        url: match[0],
        author: message.username,
        time: new Date(message.time).toLocaleString('de-DE', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: TIMEZONE
        })
      })
    }
  }

  return chartUrls
}

function formatChatModule(
  id: string,
  range: ModuleRange | null,
  messages: ChatMessage[],
  options: { truncateAt?: number } = {}
): string {
  const rangeValue = range
    ? `${range.startDate.toISOString()}..${range.endDate.toISOString()}`
    : 'not-requested'

  const lines = [
    `<module id="${id}" range="${rangeValue}" timezone="${TIMEZONE}" cacheKey="${range?.cacheKey ?? 'none'}">`
  ]

  if (messages.length === 0) {
    lines.push('[no messages]')
  } else {
    for (const message of messages) {
      const time = new Date(message.time)
      const berlinTime = time.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: TIMEZONE
      })
      const text = options.truncateAt && message.text.length > options.truncateAt
        ? `${message.text.slice(0, options.truncateAt)}...`
        : message.text
      lines.push(`[${time.toISOString()} | Berlin ${berlinTime} | @${message.username} | mod=${Boolean(message.is_moderator)}] ${text}`)
    }
  }

  lines.push('</module>')
  return lines.join('\n')
}

function computeActivity(messages: ChatMessage[], range: ModuleRange | null, mode: TimelineMode): {
  buckets: ActivityBucket[]
  stats: ActivityStats | null
} {
  if (!range) return { buckets: [], stats: null }

  const interval = getDefaultInterval(mode)
  const intervalMs = getIntervalMs(interval)
  const bucketMap = new Map<number, { count: number; users: Set<string> }>()
  const bucketStart = Math.floor(range.startDate.getTime() / intervalMs) * intervalMs
  const bucketEnd = Math.ceil(range.endDate.getTime() / intervalMs) * intervalMs

  for (let ts = bucketStart; ts <= bucketEnd; ts += intervalMs) {
    bucketMap.set(ts, { count: 0, users: new Set() })
  }

  for (const message of messages) {
    const bucketTs = Math.floor(new Date(message.time).getTime() / intervalMs) * intervalMs
    const bucket = bucketMap.get(bucketTs)
    if (bucket) {
      bucket.count++
      bucket.users.add(message.username)
    }
  }

  const allUsers = new Set(messages.map(message => message.username))
  const counts = Array.from(bucketMap.values()).map(bucket => bucket.count)
  const nonZeroCounts = counts.filter(count => count > 0)
  const maxCount = Math.max(...counts, 0)
  const avgCount = nonZeroCounts.length > 0
    ? nonZeroCounts.reduce((sum, count) => sum + count, 0) / nonZeroCounts.length
    : 0

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
    .map(([ts, bucket]) => {
      const timestamp = new Date(ts)
      return {
        timestamp: timestamp.toISOString(),
        label: formatBucketLabel(timestamp, mode),
        count: bucket.count,
        uniqueUsers: bucket.users.size,
        intensity: maxCount > 0 ? bucket.count / maxCount : 0
      }
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  return {
    buckets,
    stats: {
      totalMessages: messages.length,
      totalUsers: allUsers.size,
      avgPerBucket: Math.round(avgCount * 10) / 10,
      maxPerBucket: maxCount,
      peakTime: peakTs ? formatBucketLabel(new Date(peakTs), mode) : '',
      quietTime: quietTs ? formatBucketLabel(new Date(quietTs), mode) : '',
      mode,
      interval,
      startDate: range.startDate.toISOString(),
      endDate: range.endDate.toISOString()
    }
  }
}

function formatActivityContext(buckets: ActivityBucket[], stats: ActivityStats | null, mode: TimelineMode): string {
  if (!stats || buckets.length === 0) return 'Keine Activity-Buckets vorhanden.'

  const topN = mode === '7d' ? 12 : mode === '3d' ? 8 : 6
  const nonEmpty = buckets.filter(bucket => bucket.count > 0)
  const avgCount = nonEmpty.length > 0
    ? nonEmpty.reduce((sum, bucket) => sum + bucket.count, 0) / nonEmpty.length
    : 0
  const significant = nonEmpty
    .filter(bucket => bucket.count >= avgCount * 0.5)
    .sort((a, b) => b.count - a.count)
    .slice(0, topN)

  return [
    `Activity total: ${stats.totalMessages} messages, ${stats.totalUsers} users`,
    `Peak: ${stats.peakTime || 'none'} (${stats.maxPerBucket} messages)`,
    'Significant buckets:',
    ...significant.map((bucket, index) => `${index + 1}. ${bucket.label} (${bucket.count} messages, ${bucket.uniqueUsers} users) at ${bucket.timestamp}`)
  ].join('\n')
}

function getFearGreedPeriodInfo(messages: ChatMessage[]): {
  todayMessages: ChatMessage[]
  last3DaysMessages: ChatMessage[]
  todayStartBerlin: Date
} {
  const berlinDateStr = getNewspaperDateKey()
  const todayStartBerlin = getNewspaperDayBounds(berlinDateStr).startDate
  const threeDaysAgoBerlin = getNewspaperDayBounds(addDaysToDateKey(berlinDateStr, -3)).startDate

  return {
    todayStartBerlin,
    todayMessages: messages.filter(message => new Date(message.time) >= todayStartBerlin),
    last3DaysMessages: messages.filter(message => new Date(message.time) >= threeDaysAgoBerlin)
  }
}

function buildRanges(request: DailyAIRequest): {
  cacheDate: string
  dayRange: number
  selectedDates: string[]
  timelineMode: TimelineMode
  modules: DailyAIContext['modules']
  ranges: DailyAIContext['ranges']
} {
  const today = getNewspaperDateKey()
  const selectedDates = request.selectedDates?.length ? request.selectedDates : [today]
  const dayRange = request.dayRange || selectedDates.length || 1
  const cacheDate = selectedDates[0] || today
  const timelineMode = request.timelineMode || '24h'
  const isTodayOneDay = cacheDate === today && dayRange === 1

  const includeNewspaper = request.includeNewspaper ?? true
  const includeTicker = request.includeTicker ?? isTodayOneDay
  const includeTimeline = request.includeTimeline ?? isTodayOneDay
  const includeFearGreed = request.includeFearGreed ?? isTodayOneDay
  const includeTraderLeaderboard = request.includeTraderLeaderboard ?? includeNewspaper

  const newspaperRange = includeNewspaper
    ? {
        ...getNewspaperRange(selectedDates),
        cacheKey: `newspaper_cache:${cacheDate}:${dayRange}`
      }
    : null

  const tickerRange = includeTicker
    ? {
        ...getRollingRange('24h'),
        cacheKey: 'ticker-24h'
      }
    : null

  const timelineRange = includeTimeline
    ? {
        ...getRollingRange(timelineMode),
        cacheKey: `timeline-${timelineMode}`
      }
    : null

  const fearGreedRange = includeFearGreed
    ? {
        ...getRollingRange('7d'),
        cacheKey: `fear_greed_cache:${today}`
      }
    : null

  const traderLeaderboardRange = includeTraderLeaderboard
    ? {
        ...getNewspaperRange(selectedDates),
        cacheKey: `trader_leaderboard:${cacheDate}:${dayRange}`
      }
    : null

  return {
    cacheDate,
    dayRange,
    selectedDates,
    timelineMode,
    modules: {
      newspaper: includeNewspaper,
      ticker: includeTicker,
      timeline: includeTimeline,
      fearGreed: includeFearGreed,
      traderLeaderboard: includeTraderLeaderboard
    },
    ranges: {
      newspaper: newspaperRange,
      ticker: tickerRange,
      timeline: timelineRange,
      fearGreed: fearGreedRange,
      traderLeaderboard: traderLeaderboardRange
    }
  }
}

function buildFetchRange(ranges: DailyAIContext['ranges']): { startDate: Date; endDate: Date } {
  const requestedRanges = Object.values(ranges).filter((range): range is ModuleRange => range !== null)
  if (requestedRanges.length === 0) {
    throw new Error('No daily AI modules requested')
  }

  return {
    startDate: new Date(Math.min(...requestedRanges.map(range => range.startDate.getTime()))),
    endDate: new Date(Math.max(...requestedRanges.map(range => range.endDate.getTime())))
  }
}

function formatChartUrls(chartUrls: Array<{ url: string; author: string; time: string }>): string {
  if (chartUrls.length === 0) return 'Keine TradingView Chart URLs im Newspaper-Modul gefunden.'

  return chartUrls
    .map(chart => `- ${chart.url} (von @${chart.author} um ${chart.time})`)
    .join('\n')
}

interface DailyPromptParams {
  request: DailyAIRequest
  selectedDates: string[]
  cacheDate: string
  dayRange: number
  timelineMode: TimelineMode
  modules: DailyAIContext['modules']
  ranges: DailyAIContext['ranges']
  btcContext: BTCContext | null
  previousFearGreed: PreviousFearGreed | null
  newspaperMessages: ChatMessage[]
  tickerMessages: ChatMessage[]
  timelineMessages: ChatMessage[]
  fearGreedMessages: ChatMessage[]
  traderLeaderboardMessages: ChatMessage[]
  traderLeaderboardOhlc: OHLCData[]
  activityBuckets: ActivityBucket[]
  activityStats: ActivityStats | null
  chartUrls: Array<{ url: string; author: string; time: string }>
}

export type PromptBlockGroup =
  | 'system'
  | 'context'
  | 'registry'
  | 'specs'
  | 'input'
  | 'contract'
  | 'validation'

export interface PromptBlockMeta {
  label: string
  value: string
}

export interface PromptBlock {
  id: string
  group: PromptBlockGroup
  groupLabel: string
  title: string
  description: string
  active: boolean
  cadence: string
  refreshedBy: string[]
  body: string
  charCount: number
  tokenEstimate: number
  meta: PromptBlockMeta[]
}

/**
 * Rough token estimate (~4 chars/token). This is an approximation for the
 * prompt inspector UI; the authoritative token count comes from the provider
 * usage stats stored on a generated issue.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

function rangeMeta(range: ModuleRange | null): PromptBlockMeta[] {
  if (!range) return [{ label: 'Range', value: 'nicht angefragt' }]
  return [
    { label: 'Von', value: berlinDateTimeString(range.startDate) },
    { label: 'Bis', value: berlinDateTimeString(range.endDate) },
    { label: 'Cache-Key', value: range.cacheKey }
  ]
}

function messageMeta(range: ModuleRange | null, messages: ChatMessage[]): PromptBlockMeta[] {
  return [
    ...rangeMeta(range),
    { label: 'Nachrichten', value: messages.length.toLocaleString('de-DE') },
    { label: 'User', value: String(countUniqueUsers(messages)) }
  ]
}

function makeBlock(
  input: Omit<PromptBlock, 'charCount' | 'tokenEstimate' | 'meta'> & { meta?: PromptBlockMeta[] }
): PromptBlock {
  return {
    ...input,
    meta: input.meta ?? [],
    charCount: input.body.length,
    tokenEstimate: estimateTokens(input.body)
  }
}

const CADENCE_STATIC = 'Statisch - aendert sich nur bei Deploy'
const CADENCE_PER_GENERATION = 'Pro Generierung (Zeit, BTC, Flags)'
const CADENCE_FULL_ISSUE = 'Bei voller Ausgabe-Generierung'
const CADENCE_FULL_OR_WIDGET = 'Volle Ausgabe oder Widget-Refresh'

export function buildDailyPromptBlocks(params: DailyPromptParams): PromptBlock[] {
  const { todayMessages, last3DaysMessages, todayStartBerlin } = getFearGreedPeriodInfo(params.fearGreedMessages)
  const traderLeaderboardPrompt = params.modules.traderLeaderboard
    ? buildLeaderboardUserPrompt({
        messages: params.traderLeaderboardMessages.map((message, index) => ({
          id: `${message.time}-${index}`,
          username: message.username,
          text: message.text,
          time: message.time
        })),
        ohlcData: params.traderLeaderboardOhlc,
        from: params.ranges.traderLeaderboard?.startDate.toISOString() ?? params.cacheDate,
        to: params.ranges.traderLeaderboard?.endDate.toISOString() ?? params.cacheDate,
        daysBack: Math.max(params.dayRange, 1),
        today: params.cacheDate
      })
    : 'Trader Leaderboard not requested.'
  const modulePromptProgram = createPromptProgram()
  for (const newspaperModule of firstPartyNewspaperModules) {
    modulePromptProgram.add(newspaperModule.prompt({
      mode: 'composed',
      outputPath: `modules.${newspaperModule.id}`
    }))
  }

  return [
    makeBlock({
      id: 'system_role',
      group: 'system',
      groupLabel: '00 - System Role',
      title: 'System-Rolle & globale Regeln',
      description: 'Produkt, Sprache, Tonalitaet und global verbotene Inhalte.',
      active: true,
      cadence: CADENCE_STATIC,
      refreshedBy: [],
      body: `UNIFIED_DAILY_AI_PROMPT/

00_SYSTEM_ROLE/
Product: Financial Retarded Times
Language: German
Tone: neutral, trocken, analytisch
Global forbidden content: Nachrichten die mit "//" und einem Preis beginnen sind Rate Chart Game Tipps und müssen in ALLEN Modulen ignoriert werden.`
    }),
    makeBlock({
      id: 'writing_rules',
      group: 'system',
      groupLabel: '00 - System Role',
      title: 'Newspaper Schreibregeln (UNIFIED_PROMPT)',
      description: 'Statischer Redaktions-Styleguide fuer alle Artikel.',
      active: true,
      cadence: CADENCE_STATIC,
      refreshedBy: [],
      body: `Existing newspaper writing rules:
${UNIFIED_PROMPT}`
    }),
    makeBlock({
      id: 'request_context',
      group: 'context',
      groupLabel: '01 - Request Context',
      title: 'Request-Kontext (Zeit, BTC, Flags)',
      description: 'Aktuelle Zeit, BTC-Markt, angefragte Module und Cache-Ziele.',
      active: true,
      cadence: CADENCE_PER_GENERATION,
      refreshedBy: ['full-issue', 'widget'],
      meta: [
        { label: 'Quelle', value: params.request.source || 'newspaper' },
        { label: 'BTC', value: params.btcContext ? `$${params.btcContext.currentPrice.toLocaleString('de-DE')}` : 'n/a' }
      ],
      body: `01_REQUEST_CONTEXT/
now_utc: ${new Date().toISOString()}
now_berlin: ${berlinNow()}
source: ${params.request.source || 'newspaper'}
btc_context:
${formatBTCContext(params.btcContext)}

requested_modules:
- newspaper: ${params.modules.newspaper}
- ticker: ${params.modules.ticker}
- timeline: ${params.modules.timeline}
- fear_greed: ${params.modules.fearGreed}
- trader_leaderboard: ${params.modules.traderLeaderboard}

cache_targets:
- newspaper: ${params.ranges.newspaper?.cacheKey ?? 'not-requested'}
- ticker: ${params.ranges.ticker?.cacheKey ?? 'not-requested'}
- timeline: ${params.ranges.timeline?.cacheKey ?? 'not-requested'}
- fear_greed: ${params.ranges.fearGreed?.cacheKey ?? 'not-requested'}
- trader_leaderboard: ${params.ranges.traderLeaderboard?.cacheKey ?? 'not-requested'}`
    }),
    makeBlock({
      id: 'module_registry',
      group: 'registry',
      groupLabel: '01 - Module Registry',
      title: 'Modul-Registry',
      description: 'Von den registrierten Newspaper-Modulen erzeugte Prompt-Programme.',
      active: true,
      cadence: CADENCE_STATIC,
      refreshedBy: [],
      body: `module_registry/
${modulePromptProgram.render()}`
    }),
    makeBlock({
      id: 'spec_newspaper',
      group: 'specs',
      groupLabel: '02 - Module Specs',
      title: 'Spec: Newspaper',
      description: 'Regeln und Output-Felder fuer das Newspaper-Modul.',
      active: params.modules.newspaper,
      cadence: CADENCE_FULL_ISSUE,
      refreshedBy: ['full-issue'],
      meta: [
        { label: 'Selected dates', value: params.selectedDates.join(', ') },
        { label: 'Day range', value: String(params.dayRange) }
      ],
      body: `02_MODULE_SPECS/
newspaper/
- requested: ${params.modules.newspaper}
- range_type: archive_dates
- selected_dates: ${params.selectedDates.join(', ')}
- day_range: ${params.dayRange}
- cache_key: ${params.ranges.newspaper?.cacheKey ?? 'not-requested'}
- output: topContributors, trendingTopics, featuredArticle, secondaryArticle, events, shortNews, moreArticles
- rules: Use ONLY newspaper_messages. Do not use rolling live messages for old archive dates.
- chart_urls:
${formatChartUrls(params.chartUrls)}`
    }),
    makeBlock({
      id: 'spec_ticker',
      group: 'specs',
      groupLabel: '02 - Module Specs',
      title: 'Spec: Ticker',
      description: 'Regeln fuer das Live-Ticker-Banner (rolling 24h).',
      active: params.modules.ticker,
      cadence: CADENCE_FULL_ISSUE,
      refreshedBy: ['full-issue'],
      body: `ticker/
- requested: ${params.modules.ticker}
- range_type: rolling_24h
- cache_key: ${params.ranges.ticker?.cacheKey ?? 'not-requested'}
- output: 15-25 punchy moving banner events if requested, otherwise []
- rules: Use ONLY ticker_messages. Every event needs a headline and quote if requested.`
    }),
    makeBlock({
      id: 'spec_timeline',
      group: 'specs',
      groupLabel: '02 - Module Specs',
      title: 'Spec: Timeline',
      description: 'Regeln fuer die Chat-Timeline inkl. Activity-Buckets.',
      active: params.modules.timeline,
      cadence: CADENCE_FULL_ISSUE,
      refreshedBy: ['full-issue'],
      body: `timeline/
- requested: ${params.modules.timeline}
- range_type: rolling
- mode: ${params.timelineMode}
- cache_key: ${params.ranges.timeline?.cacheKey ?? 'not-requested'}
- output: topic timeline events, summary, activityLevel, dominantSentiment if requested
- activity_buckets:
${formatActivityContext(params.activityBuckets, params.activityStats, params.timelineMode)}
- rules: Use ONLY timeline_messages. Cover the listed activity buckets when possible.`
    }),
    makeBlock({
      id: 'spec_fear_greed',
      group: 'specs',
      groupLabel: '02 - Module Specs',
      title: 'Spec: Fear & Greed',
      description: 'Regeln fuer den Fear & Greed Index (rolling 7d).',
      active: params.modules.fearGreed,
      cadence: CADENCE_FULL_OR_WIDGET,
      refreshedBy: ['full-issue', 'widget:fear-greed'],
      body: `fear_greed/
- requested: ${params.modules.fearGreed}
- range_type: rolling_7d
- today_start_berlin: ${todayStartBerlin.toISOString()}
- periods: today=${todayMessages.length} messages, last3Days=${last3DaysMessages.length} messages, last7Days=${params.fearGreedMessages.length} messages
- previous_fear_greed:
${formatPreviousFearGreed(params.previousFearGreed)}
- output: today, last3Days, last7Days, trend, insight, topDrivers if requested
- rules: Use ONLY fear_greed_messages.`
    }),
    makeBlock({
      id: 'spec_trader_leaderboard',
      group: 'specs',
      groupLabel: '02 - Module Specs',
      title: 'Spec: Trader Leaderboard',
      description: 'Regeln fuer das Trader-Leaderboard (Archiv-Range).',
      active: params.modules.traderLeaderboard,
      cadence: CADENCE_FULL_OR_WIDGET,
      refreshedBy: ['full-issue', 'widget:trader-leaderboard'],
      body: `trader_leaderboard/
- requested: ${params.modules.traderLeaderboard}
- range_type: archive_dates
- selected_dates: ${params.selectedDates.join(', ')}
- cache_key: ${params.ranges.traderLeaderboard?.cacheKey ?? 'not-requested'}
- output: weekSummary, leaderboard, hallOfShame, dataRange if requested
- rules: Use ONLY trader_leaderboard_context. Ignore // game tips. Score only clear bullish/bearish BTC calls against the supplied 1H BTC prices.`
    }),
    makeBlock({
      id: 'input_newspaper',
      group: 'input',
      groupLabel: '03 - Input Data',
      title: 'Chat-Verlauf: Newspaper (Archiv)',
      description: 'Injizierte Archiv-Chatnachrichten fuer die ausgewaehlten Tage.',
      active: params.modules.newspaper,
      cadence: CADENCE_FULL_ISSUE,
      refreshedBy: ['full-issue'],
      meta: messageMeta(params.ranges.newspaper, params.newspaperMessages),
      body: `03_INPUT_DATA/
newspaper_messages/
${formatChatModule('newspaper', params.ranges.newspaper, params.newspaperMessages)}`
    }),
    makeBlock({
      id: 'input_ticker',
      group: 'input',
      groupLabel: '03 - Input Data',
      title: 'Chat-Verlauf: Ticker (24h)',
      description: 'Letzte 24h Chatnachrichten fuer das Ticker-Banner (max 500).',
      active: params.modules.ticker,
      cadence: CADENCE_FULL_ISSUE,
      refreshedBy: ['full-issue'],
      meta: messageMeta(params.ranges.ticker, params.tickerMessages),
      body: `ticker_messages/
${formatChatModule('ticker', params.ranges.ticker, params.tickerMessages)}`
    }),
    makeBlock({
      id: 'input_timeline',
      group: 'input',
      groupLabel: '03 - Input Data',
      title: 'Chat-Verlauf: Timeline',
      description: 'Rolling Chatnachrichten fuer die Timeline (auf 300 Zeichen gekuerzt).',
      active: params.modules.timeline,
      cadence: CADENCE_FULL_ISSUE,
      refreshedBy: ['full-issue'],
      meta: messageMeta(params.ranges.timeline, params.timelineMessages),
      body: `timeline_messages/
${formatChatModule('timeline', params.ranges.timeline, params.timelineMessages, { truncateAt: 300 })}`
    }),
    makeBlock({
      id: 'input_fear_greed',
      group: 'input',
      groupLabel: '03 - Input Data',
      title: 'Chat-Verlauf: Fear & Greed (7d)',
      description: 'Letzte 7 Tage Chatnachrichten fuer die Sentiment-Analyse.',
      active: params.modules.fearGreed,
      cadence: CADENCE_FULL_OR_WIDGET,
      refreshedBy: ['full-issue', 'widget:fear-greed'],
      meta: messageMeta(params.ranges.fearGreed, params.fearGreedMessages),
      body: `fear_greed_messages/
${formatChatModule('fear_greed', params.ranges.fearGreed, params.fearGreedMessages)}`
    }),
    makeBlock({
      id: 'input_trader_leaderboard',
      group: 'input',
      groupLabel: '03 - Input Data',
      title: 'Chat + OHLC: Trader Leaderboard',
      description: 'Direktional-Calls plus 1H BTC-Preise zur Bewertung.',
      active: params.modules.traderLeaderboard,
      cadence: CADENCE_FULL_OR_WIDGET,
      refreshedBy: ['full-issue', 'widget:trader-leaderboard'],
      meta: [
        ...messageMeta(params.ranges.traderLeaderboard, params.traderLeaderboardMessages),
        { label: 'OHLC Candles', value: String(params.traderLeaderboardOhlc.length) }
      ],
      body: `trader_leaderboard_context/
${traderLeaderboardPrompt}`
    }),
    makeBlock({
      id: 'output_contract',
      group: 'contract',
      groupLabel: '04 - Output Contract',
      title: 'Output-Contract (Schema)',
      description: 'Erwartete JSON-Struktur und Regeln fuer nicht angefragte Module.',
      active: true,
      cadence: CADENCE_STATIC,
      refreshedBy: [],
      body: `04_OUTPUT_CONTRACT/
Return exactly one valid JSON object matching DailyAIResponseSchema:
- newspaper: { requested, reason, data }
- ticker: { requested, reason, events }
- timeline: { requested, reason, events, summary, activityLevel, dominantSentiment }
- fearGreed: { requested, reason, data }
- traderLeaderboard: { requested, reason, data }

For every unrequested module:
- set requested=false
- set reason to a short explanation
- set data=null for data modules
- set events=[] for event modules
- set summary/activityLevel/dominantSentiment=null for timeline
- set traderLeaderboard.data=null when trader_leaderboard is not requested`
    }),
    makeBlock({
      id: 'validation_rules',
      group: 'validation',
      groupLabel: '05 - Final Validation',
      title: 'Finale Validierungs-Regeln',
      description: 'Letzte Leitplanken bevor das Modell antwortet.',
      active: true,
      cadence: CADENCE_STATIC,
      refreshedBy: [],
      body: `05_FINAL_VALIDATION_RULES/
- Every output item must come from its module range.
- Quotes must be exact or omitted with null.
- Never include //price game tips.
- Do not repeat chart URLs inside newspaper.
- Do not repeat topics inside newspaper.
- Do not use ticker_messages for newspaper.
- Do not use rolling live messages when generating an archive-date newspaper.
- Do not generate historical ticker or Fear & Greed data for an old newspaper date unless that module was explicitly requested.`
    })
  ]
}

function renderPromptBlocks(blocks: PromptBlock[]): string {
  return blocks.map(block => block.body).join('\n\n')
}

function buildDailyPrompt(params: DailyPromptParams): string {
  return renderPromptBlocks(buildDailyPromptBlocks(params))
}

function addTickerIds(events: DailyTickerEventData[]): TickerCacheEvent[] {
  return events
    .map((event, index): TickerCacheEvent | null => {
      const text = event.text?.trim() || event.headline?.trim() || event.quote?.trim()
      if (!text) return null

      return {
        ...event,
        text: text.slice(0, 100),
        label: event.label ? event.label.slice(0, 8) : null,
        headline: event.headline ? event.headline.slice(0, 80) : text.slice(0, 80),
        id: `${event.date}-${event.time.replace(':', '')}-${index}`
      }
    })
    .filter((event): event is TickerCacheEvent => Boolean(event))
}

function buildFearGreedDateRangeInfo(messages: ChatMessage[]): FearGreedDateRangeInfo {
  const oldest = messages[0] ? new Date(messages[0].time) : new Date()
  const newest = messages[messages.length - 1] ? new Date(messages[messages.length - 1].time) : new Date()
  const { todayMessages } = getFearGreedPeriodInfo(messages)

  return {
    oldestDate: berlinDateString(oldest),
    newestDate: berlinDateTimeString(newest),
    todayMessageCount: todayMessages.length
  }
}

async function writeDailyCaches(
  supabase: SupabaseServerClient,
  object: DailyAIResponseData,
  context: DailyAIContext,
  aiUsage: NewspaperAIUsage | null
): Promise<void> {
  const cacheWrites: Array<Promise<void>> = []
  let enrichedNewspaperData: UnifiedNewspaperData | null = null

  if (object.newspaper.requested && object.newspaper.data && context.ranges.newspaper) {
    const enriched = normalizeNewspaperData(
      object.newspaper.data,
      context.newspaperUserAvatarMap,
      context.activeChatters
    )
    enrichedNewspaperData = enriched
  }

  if (object.ticker.requested && object.ticker.events.length > 0 && context.ranges.ticker) {
    cacheWrites.push(writeTickerCache(
      supabase,
      addTickerIds(object.ticker.events),
      context.ranges.ticker.startDate,
      context.ranges.ticker.endDate,
      context.counts.tickerMessages,
      context.counts.tickerUsers
    ))
  }

  if (object.timeline.requested && object.timeline.events.length > 0 && context.ranges.timeline) {
    cacheWrites.push(writeTimelineCache(
      supabase,
      context.timelineMode,
      {
        events: object.timeline.events,
        summary: object.timeline.summary,
        activityLevel: object.timeline.activityLevel,
        dominantSentiment: object.timeline.dominantSentiment
      },
      context.ranges.timeline.startDate,
      context.ranges.timeline.endDate,
      context.counts.timelineMessages,
      context.counts.timelineUsers
    ))
  }

  if (object.fearGreed.requested && object.fearGreed.data && context.fearGreedDateRangeInfo) {
    cacheWrites.push(writeFearGreedCache(
      supabase,
      object.fearGreed.data,
      context.counts.fearGreedMessages,
      context.counts.fearGreedUsers,
      context.fearGreedDateRangeInfo
    ))
    cacheWrites.push(writeNewspaperModuleCache(
      supabase,
      {
        moduleId: fearGreedModule.id,
        cacheDate: context.cacheDate,
        dayRange: context.dayRange,
        moduleVersion: fearGreedModule.version,
        resourceFingerprint: buildModuleResourceFingerprint({
          moduleId: fearGreedModule.id,
          moduleVersion: fearGreedModule.version,
          issueDate: context.cacheDate,
          dayRange: context.dayRange,
          resources: context.ranges.fearGreed
        }),
        data: {
          data: object.fearGreed.data,
          dateRange: context.fearGreedDateRangeInfo
        },
        metadata: {
          range: context.ranges.fearGreed?.cacheKey ?? null,
          aiUsage
        },
        messageCount: context.counts.fearGreedMessages,
        uniqueUsers: context.counts.fearGreedUsers
      },
      fearGreedModule.cache
    ))
  }

  if (object.traderLeaderboard.requested && object.traderLeaderboard.data && context.ranges.traderLeaderboard) {
    cacheWrites.push(writeNewspaperModuleCache(
      supabase,
      {
        moduleId: traderLeaderboardModule.id,
        cacheDate: context.cacheDate,
        dayRange: context.dayRange,
        moduleVersion: traderLeaderboardModule.version,
        resourceFingerprint: buildModuleResourceFingerprint({
          moduleId: traderLeaderboardModule.id,
          moduleVersion: traderLeaderboardModule.version,
          issueDate: context.cacheDate,
          dayRange: context.dayRange,
          resources: context.ranges.traderLeaderboard
        }),
        data: {
          data: object.traderLeaderboard.data,
          range: {
            startDate: context.ranges.traderLeaderboard.startDate.toISOString(),
            endDate: context.ranges.traderLeaderboard.endDate.toISOString(),
            cacheKey: context.ranges.traderLeaderboard.cacheKey
          }
        },
        metadata: {
          ohlcCandles: context.traderLeaderboardOhlc.length,
          aiUsage
        },
        messageCount: context.counts.traderLeaderboardMessages,
        uniqueUsers: context.counts.traderLeaderboardUsers
      },
      traderLeaderboardModule.cache
    ))
  }

  if (object.newspaper.requested && context.ranges.newspaper) {
    cacheWrites.push(writeNewspaperIssueCache(
      supabase,
      createNewspaperIssue({
        object,
        context,
        newspaperData: enrichedNewspaperData,
        aiUsage,
        source: 'generated'
      })
    ))
  }

  await Promise.all(cacheWrites)
}

async function prepareDailyAIInputs(request: DailyAIRequest): Promise<{
  supabase: SupabaseServerClient
  context: DailyAIContext
  promptParams: DailyPromptParams
}> {
  const supabase = await createClient()
  const rangeConfig = buildRanges(request)
  const fetchRange = buildFetchRange(rangeConfig.ranges)

  const [allMessages, btcContext, previousFearGreed] = await Promise.all([
    fetchMessagesForRange(supabase, fetchRange.startDate, fetchRange.endDate),
    fetchBTCContext(),
    rangeConfig.modules.fearGreed ? fetchPreviousFearGreed(supabase) : Promise.resolve(null)
  ])

  const newspaperMessages = filterMessages(allMessages, rangeConfig.ranges.newspaper)
  const tickerMessages = filterMessages(allMessages, rangeConfig.ranges.ticker).slice(-500)
  const timelineMessages = filterMessages(allMessages, rangeConfig.ranges.timeline)
  const fearGreedMessages = filterMessages(allMessages, rangeConfig.ranges.fearGreed)
  const traderLeaderboardMessages = filterMessages(allMessages, rangeConfig.ranges.traderLeaderboard)

  if (rangeConfig.modules.newspaper && newspaperMessages.length === 0) {
    throw new Error('No newspaper messages found for selected date range')
  }

  const { userAvatarMap, activeChatters } = buildActiveChatters(newspaperMessages)
  const { buckets: activityBuckets, stats: activityStats } = computeActivity(
    timelineMessages,
    rangeConfig.ranges.timeline,
    rangeConfig.timelineMode
  )
  const chartUrls = extractChartUrls(newspaperMessages)
  const fearGreedDateRangeInfo = rangeConfig.modules.fearGreed
    ? buildFearGreedDateRangeInfo(fearGreedMessages)
    : null
  const traderLeaderboardOhlc = rangeConfig.modules.traderLeaderboard
    ? await fetchLeaderboardOHLC(supabase, Math.max(rangeConfig.dayRange, 1))
    : []

  const context: DailyAIContext = {
    cacheDate: rangeConfig.cacheDate,
    selectedDates: rangeConfig.selectedDates,
    dayRange: rangeConfig.dayRange,
    timelineMode: rangeConfig.timelineMode,
    modules: rangeConfig.modules,
    ranges: rangeConfig.ranges,
    counts: {
      newspaperMessages: newspaperMessages.length,
      tickerMessages: tickerMessages.length,
      timelineMessages: timelineMessages.length,
      fearGreedMessages: fearGreedMessages.length,
      traderLeaderboardMessages: traderLeaderboardMessages.length,
      newspaperUsers: countUniqueUsers(newspaperMessages),
      tickerUsers: countUniqueUsers(tickerMessages),
      timelineUsers: countUniqueUsers(timelineMessages),
      fearGreedUsers: countUniqueUsers(fearGreedMessages),
      traderLeaderboardUsers: countUniqueUsers(traderLeaderboardMessages)
    },
    newspaperUserAvatarMap: userAvatarMap,
    activeChatters,
    fearGreedDateRangeInfo,
    traderLeaderboardOhlc,
    timelineActivityBuckets: activityBuckets,
    timelineActivityStats: activityStats
  }

  const promptParams: DailyPromptParams = {
    request,
    selectedDates: rangeConfig.selectedDates,
    cacheDate: rangeConfig.cacheDate,
    dayRange: rangeConfig.dayRange,
    timelineMode: rangeConfig.timelineMode,
    modules: rangeConfig.modules,
    ranges: rangeConfig.ranges,
    btcContext,
    previousFearGreed,
    newspaperMessages,
    tickerMessages,
    timelineMessages,
    fearGreedMessages,
    traderLeaderboardMessages,
    traderLeaderboardOhlc,
    activityBuckets,
    activityStats,
    chartUrls
  }

  return { supabase, context, promptParams }
}

export interface DailyAIPromptPreview {
  meta: {
    cacheDate: string
    selectedDates: string[]
    dayRange: number
    timelineMode: TimelineMode
    modules: DailyAIContext['modules']
    counts: DailyAIContext['counts']
    generatedAt: string
    model: string
  }
  blocks: PromptBlock[]
  totals: {
    tokenEstimate: number
    activeTokenEstimate: number
    charCount: number
  }
}

/**
 * Builds the exact prompt that createDailyAIStream would send, broken into
 * structured blocks for the prompt inspector. Does NOT call the model, so it
 * costs no tokens. Reuses prepareDailyAIInputs so the preview cannot drift
 * from the real generation path.
 */
export async function buildDailyAIPromptPreview(request: DailyAIRequest = {}): Promise<DailyAIPromptPreview> {
  const { context, promptParams } = await prepareDailyAIInputs(request)
  const blocks = buildDailyPromptBlocks(promptParams)

  const tokenEstimate = blocks.reduce((sum, block) => sum + block.tokenEstimate, 0)
  const charCount = blocks.reduce((sum, block) => sum + block.charCount, 0)
  const activeTokenEstimate = blocks
    .filter(block => block.active)
    .reduce((sum, block) => sum + block.tokenEstimate, 0)

  return {
    meta: {
      cacheDate: context.cacheDate,
      selectedDates: context.selectedDates,
      dayRange: context.dayRange,
      timelineMode: context.timelineMode,
      modules: context.modules,
      counts: context.counts,
      generatedAt: new Date().toISOString(),
      model: 'gpt-5.4'
    },
    blocks,
    totals: { tokenEstimate, activeTokenEstimate, charCount }
  }
}

export async function createDailyAIStream(request: DailyAIRequest = {}) {
  const { supabase, context, promptParams } = await prepareDailyAIInputs(request)
  const prompt = buildDailyPrompt(promptParams)

  console.log('[DAILY-AI] Generating unified stream', {
    modules: context.modules,
    cacheDate: context.cacheDate,
    dayRange: context.dayRange,
    counts: context.counts
  })

  let streamFailure: DailyAIErrorDetails | null = null
  let aiUsage: NewspaperAIUsage | null = null

  const result = streamObject({
    model: openai('gpt-5.4'),
    schema: DailyAIResponseSchema,
    system: `Du bist der Unified Daily AI Generator der Financial Retarded Times. Befolge die Modulgrenzen strikt und gib ausschließlich das strukturierte Objekt zurück.`,
    providerOptions: { openai: { reasoning: { effort: 'high' } } },
    prompt,
    onFinish: async ({ object, error, usage, response }) => {
      if (object) {
        aiUsage = summarizeDailyAIUsage(usage, response)
        console.log('[DAILY-AI] Token usage:', JSON.stringify(aiUsage))
        await writeDailyCaches(supabase, object, context, aiUsage)
      } else if (error && streamFailure) {
        console.warn('[DAILY-AI] Skipping schema error after stream failure:', JSON.stringify(streamFailure))
      } else if (error) {
        console.error('[DAILY-AI] Schema error:', JSON.stringify(dailyAIErrorForLog(error)))
      }
    },
    onError: ({ error }) => {
      streamFailure = dailyAIErrorForLog(error)
      console.error('[DAILY-AI] Stream error:', JSON.stringify(streamFailure))
    }
  })

  return { result, context, getStreamFailure: () => streamFailure, getAIUsage: () => aiUsage }
}

export async function generateDailyAIObject(request: DailyAIRequest = {}): Promise<{
  object: DailyAIResponseData
  context: DailyAIContext
  aiUsage: NewspaperAIUsage | null
}> {
  const { result, context, getStreamFailure, getAIUsage } = await createDailyAIStream(request)
  let object: DailyAIResponseData | undefined

  try {
    object = await result.object
  } catch (error) {
    const details = getStreamFailure() ?? getDailyAIErrorDetails(error)
    throw createProviderError(details, error) ?? error
  }

  if (!object) {
    const details = getStreamFailure()
    if (details) {
      throw createProviderError(details, new Error(details.message)) ?? new Error(details.userMessage)
    }
    throw new Error('Unified daily AI did not return an object')
  }

  return { object, context, aiUsage: getAIUsage() }
}

export function toLegacyTickerResponse(object: DailyAIResponseData): { events: TickerCacheEvent[]; eventCount: number } {
  const events = addTickerIds(object.ticker.events)
  return { events, eventCount: events.length }
}

export function toLegacyTimelineResponse(object: DailyAIResponseData): {
  events: DailyTimelineEventData[]
  summary: string | null
  activityLevel: 'low' | 'medium' | 'high' | null
  dominantSentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed' | null
} {
  return {
    events: object.timeline.events,
    summary: object.timeline.summary,
    activityLevel: object.timeline.activityLevel,
    dominantSentiment: object.timeline.dominantSentiment
  }
}

export function toLegacyFearGreedResponse(object: DailyAIResponseData): DailyFearGreedData {
  if (!object.fearGreed.data) {
    throw new Error('Unified daily AI did not generate Fear & Greed data')
  }

  return object.fearGreed.data
}
