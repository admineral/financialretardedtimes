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
import { createPromptProgram, createNewspaperIssue, writeNewspaperIssueCache } from '../engine'
import { firstPartyNewspaperModules } from '../modules'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>
type TimelineMode = '24h' | '3d' | '7d'

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
  source?: 'newspaper' | 'ticker' | 'timeline' | 'fear-greed' | 'cron' | 'manual'
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
  }
  ranges: {
    newspaper: ModuleRange | null
    ticker: ModuleRange | null
    timeline: ModuleRange | null
    fearGreed: ModuleRange | null
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
  }
  newspaperUserAvatarMap: Map<string, string>
  activeChatters: UnifiedNewspaperData['activeChatters']
  fearGreedDateRangeInfo: FearGreedDateRangeInfo | null
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

  return {
    cacheDate,
    dayRange,
    selectedDates,
    timelineMode,
    modules: {
      newspaper: includeNewspaper,
      ticker: includeTicker,
      timeline: includeTimeline,
      fearGreed: includeFearGreed
    },
    ranges: {
      newspaper: newspaperRange,
      ticker: tickerRange,
      timeline: timelineRange,
      fearGreed: fearGreedRange
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

function buildDailyPrompt(params: {
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
  activityBuckets: ActivityBucket[]
  activityStats: ActivityStats | null
  chartUrls: Array<{ url: string; author: string; time: string }>
}): string {
  const { todayMessages, last3DaysMessages, todayStartBerlin } = getFearGreedPeriodInfo(params.fearGreedMessages)
  const modulePromptProgram = createPromptProgram()
  for (const newspaperModule of firstPartyNewspaperModules) {
    modulePromptProgram.add(newspaperModule.prompt({
      mode: 'composed',
      outputPath: `modules.${newspaperModule.id}`
    }))
  }

  return `UNIFIED_DAILY_AI_PROMPT/

00_SYSTEM_ROLE/
Product: Financial Retarded Times
Language: German
Tone: neutral, trocken, analytisch
Global forbidden content: Nachrichten die mit "//" und einem Preis beginnen sind Rate Chart Game Tipps und müssen in ALLEN Modulen ignoriert werden.

Existing newspaper writing rules:
${UNIFIED_PROMPT}

01_REQUEST_CONTEXT/
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

cache_targets:
- newspaper: ${params.ranges.newspaper?.cacheKey ?? 'not-requested'}
- ticker: ${params.ranges.ticker?.cacheKey ?? 'not-requested'}
- timeline: ${params.ranges.timeline?.cacheKey ?? 'not-requested'}
- fear_greed: ${params.ranges.fearGreed?.cacheKey ?? 'not-requested'}

module_registry/
${modulePromptProgram.render()}

02_MODULE_SPECS/
newspaper/
- requested: ${params.modules.newspaper}
- range_type: archive_dates
- selected_dates: ${params.selectedDates.join(', ')}
- day_range: ${params.dayRange}
- cache_key: ${params.ranges.newspaper?.cacheKey ?? 'not-requested'}
- output: topContributors, trendingTopics, featuredArticle, secondaryArticle, events, shortNews, moreArticles
- rules: Use ONLY newspaper_messages. Do not use rolling live messages for old archive dates.
- chart_urls:
${formatChartUrls(params.chartUrls)}

ticker/
- requested: ${params.modules.ticker}
- range_type: rolling_24h
- cache_key: ${params.ranges.ticker?.cacheKey ?? 'not-requested'}
- output: 15-25 punchy moving banner events if requested, otherwise []
- rules: Use ONLY ticker_messages. Every event needs a headline and quote if requested.

timeline/
- requested: ${params.modules.timeline}
- range_type: rolling
- mode: ${params.timelineMode}
- cache_key: ${params.ranges.timeline?.cacheKey ?? 'not-requested'}
- output: topic timeline events, summary, activityLevel, dominantSentiment if requested
- activity_buckets:
${formatActivityContext(params.activityBuckets, params.activityStats, params.timelineMode)}
- rules: Use ONLY timeline_messages. Cover the listed activity buckets when possible.

fear_greed/
- requested: ${params.modules.fearGreed}
- range_type: rolling_7d
- today_start_berlin: ${todayStartBerlin.toISOString()}
- periods: today=${todayMessages.length} messages, last3Days=${last3DaysMessages.length} messages, last7Days=${params.fearGreedMessages.length} messages
- previous_fear_greed:
${formatPreviousFearGreed(params.previousFearGreed)}
- output: today, last3Days, last7Days, trend, insight, topDrivers if requested
- rules: Use ONLY fear_greed_messages.

03_INPUT_DATA/
newspaper_messages/
${formatChatModule('newspaper', params.ranges.newspaper, params.newspaperMessages)}

ticker_messages/
${formatChatModule('ticker', params.ranges.ticker, params.tickerMessages)}

timeline_messages/
${formatChatModule('timeline', params.ranges.timeline, params.timelineMessages, { truncateAt: 300 })}

fear_greed_messages/
${formatChatModule('fear_greed', params.ranges.fearGreed, params.fearGreedMessages)}

04_OUTPUT_CONTRACT/
Return exactly one valid JSON object matching DailyAIResponseSchema:
- newspaper: { requested, reason, data }
- ticker: { requested, reason, events }
- timeline: { requested, reason, events, summary, activityLevel, dominantSentiment }
- fearGreed: { requested, reason, data }

For every unrequested module:
- set requested=false
- set reason to a short explanation
- set data=null for data modules
- set events=[] for event modules
- set summary/activityLevel/dominantSentiment=null for timeline

05_FINAL_VALIDATION_RULES/
- Every output item must come from its module range.
- Quotes must be exact or omitted with null.
- Never include //price game tips.
- Do not repeat chart URLs inside newspaper.
- Do not repeat topics inside newspaper.
- Do not use ticker_messages for newspaper.
- Do not use rolling live messages when generating an archive-date newspaper.
- Do not generate historical ticker or Fear & Greed data for an old newspaper date unless that module was explicitly requested.`
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
  context: DailyAIContext
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
  }

  if (object.newspaper.requested && context.ranges.newspaper) {
    cacheWrites.push(writeNewspaperIssueCache(
      supabase,
      createNewspaperIssue({
        object,
        context,
        newspaperData: enrichedNewspaperData,
        source: 'generated'
      })
    ))
  }

  await Promise.all(cacheWrites)
}

export async function createDailyAIStream(request: DailyAIRequest = {}) {
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
      newspaperUsers: countUniqueUsers(newspaperMessages),
      tickerUsers: countUniqueUsers(tickerMessages),
      timelineUsers: countUniqueUsers(timelineMessages),
      fearGreedUsers: countUniqueUsers(fearGreedMessages)
    },
    newspaperUserAvatarMap: userAvatarMap,
    activeChatters,
    fearGreedDateRangeInfo,
    timelineActivityBuckets: activityBuckets,
    timelineActivityStats: activityStats
  }

  const prompt = buildDailyPrompt({
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
    activityBuckets,
    activityStats,
    chartUrls
  })

  console.log('[DAILY-AI] Generating unified stream', {
    modules: context.modules,
    cacheDate: context.cacheDate,
    dayRange: context.dayRange,
    counts: context.counts
  })

  const result = streamObject({
    model: openai('gpt-5.4'),
    schema: DailyAIResponseSchema,
    system: `Du bist der Unified Daily AI Generator der Financial Retarded Times. Befolge die Modulgrenzen strikt und gib ausschließlich das strukturierte Objekt zurück.`,
    providerOptions: { openai: { reasoning: { effort: 'high' } } },
    prompt,
    onFinish: async ({ object, error }) => {
      if (object) {
        await writeDailyCaches(supabase, object, context)
      } else if (error) {
        console.error('[DAILY-AI] Schema error:', String(error))
      }
    },
    onError: (error) => {
      console.error('[DAILY-AI] Stream error:', error)
    }
  })

  return { result, context }
}

export async function generateDailyAIObject(request: DailyAIRequest = {}): Promise<{
  object: DailyAIResponseData
  context: DailyAIContext
}> {
  const { result, context } = await createDailyAIStream(request)
  const object = await result.object

  if (!object) {
    throw new Error('Unified daily AI did not return an object')
  }

  return { object, context }
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
