/**
 * context.ts (Newspaper v2 — global context assembler)
 *
 * Assembles ONE global context for the monthly generation. No per-widget
 * message slices: the model gets the chat history once (30 daily digests +
 * full raw chat of the recent days, untruncated) plus one market section,
 * and composes the paper from it.
 */

import type { createClient } from '@/lib/supabase/server'
import {
  fetchLeaderboardMessagesForRange,
  fetchLeaderboardOHLC,
  buildLeaderboardUserPrompt,
  sampleLeaderboardMessages,
  type LeaderboardChatMessage,
  type OHLCData
} from '@/app/chart-leader/lib/analysis'
import {
  addDaysToDateKey,
  getNewspaperDateKey,
  getNewspaperDayBounds,
  NEWSPAPER_TIME_ZONE
} from '../../lib/timezone'
import {
  ensureDigests,
  fetchMessagesForRange,
  findMissingDigestDays,
  getV2DateKeys,
  readDigests,
  type V2ChatMessage
} from './daily-digest'
import { buildV2Data } from './data'
import {
  V2_DAYS,
  V2_RAW_DAYS,
  type DailyDigestRow,
  type V2Data
} from './types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface V2BTCContext {
  currentPrice: number
  priceEUR: number
  change24h: number
  change7d: number
  change30d: number
  high24h: number
  low24h: number
  athPrice: number
  athDate: string
}

export async function fetchBTCContext(): Promise<V2BTCContext | null> {
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
      change7d: Math.round(market.price_change_percentage_7d * 100) / 100,
      change30d: Math.round(market.price_change_percentage_30d * 100) / 100,
      high24h: Math.round(market.high_24h.usd),
      low24h: Math.round(market.low_24h.usd),
      athPrice: Math.round(market.ath.usd),
      athDate: market.ath_date.usd.split('T')[0]
    }
  } catch (error) {
    console.error('[V2-CONTEXT] BTC fetch failed:', error)
    return null
  }
}

export interface V2GenerationInputs {
  issueDate: string
  dateKeys: string[]
  rawDateKeys: string[]
  digests: Map<string, DailyDigestRow>
  recentMessages: V2ChatMessage[]
  v2Data: V2Data
  btcContext: V2BTCContext | null
  leaderboardMessages: LeaderboardChatMessage[]
  leaderboardOhlc: OHLCData[]
  leaderboardPrompt: string
  digestsGenerated: string[]
  digestsMissing: string[]
}

/**
 * Fetches everything the stage-2 prompt needs. Also makes a best-effort pass
 * at backfilling missing digests (the digests API route can be used to
 * pre-backfill in smaller batches to avoid timeouts).
 */
export async function prepareV2Inputs(
  supabase: SupabaseServerClient,
  options: { days?: number; rawDays?: number; backfillDigests?: boolean } = {}
): Promise<V2GenerationInputs> {
  const days = options.days ?? V2_DAYS
  const rawDays = options.rawDays ?? V2_RAW_DAYS
  const issueDate = getNewspaperDateKey()
  const dateKeys = getV2DateKeys(days)

  let digestsGenerated: string[] = []
  if (options.backfillDigests ?? true) {
    const result = await ensureDigests(supabase, { days, maxPerRun: days })
    digestsGenerated = result.generated
  }

  const digests = await readDigests(supabase, dateKeys)
  const digestsMissing = findMissingDigestDays(dateKeys, digests)

  // Raw window: the most recent N Berlin days, full text, no truncation.
  const rawDateKeys = dateKeys.slice(-rawDays)
  const rawStart = getNewspaperDayBounds(rawDateKeys[0]).startDate
  const rawEnd = new Date()

  const monthStart = getNewspaperDayBounds(dateKeys[0]).startDate

  const [recentMessages, v2Data, btcContext, leaderboardFetch, leaderboardOhlc] = await Promise.all([
    fetchMessagesForRange(supabase, rawStart, rawEnd),
    buildV2Data(supabase, { days, digests }),
    fetchBTCContext(),
    fetchLeaderboardMessagesForRange(supabase, monthStart, rawEnd),
    fetchLeaderboardOHLC(supabase, days)
  ])

  const leaderboardMessages = sampleLeaderboardMessages(leaderboardFetch.messages, 1500)
  const leaderboardPrompt = buildLeaderboardUserPrompt({
    messages: leaderboardMessages,
    ohlcData: leaderboardOhlc,
    from: monthStart.toISOString(),
    to: rawEnd.toISOString(),
    daysBack: days,
    today: issueDate
  })

  return {
    issueDate,
    dateKeys,
    rawDateKeys,
    digests,
    recentMessages,
    v2Data,
    btcContext,
    leaderboardMessages,
    leaderboardOhlc,
    leaderboardPrompt,
    digestsGenerated,
    digestsMissing
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Formatters — turn inputs into prompt context sections
// ═══════════════════════════════════════════════════════════════════════

function formatBerlinDay(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: NEWSPAPER_TIME_ZONE
  })
}

export function formatDigestsSection(dateKeys: string[], digests: Map<string, DailyDigestRow>): string {
  const lines: string[] = ['<chat-digests timezone="Europe/Berlin" order="aeltester Tag zuerst">']

  for (const dateKey of dateKeys) {
    const digest = digests.get(dateKey)
    if (!digest) {
      lines.push(`<day date="${dateKey}" status="kein-digest" />`)
      continue
    }

    const { ai, stats, btc } = digest.data
    lines.push(`<day date="${dateKey}" label="${formatBerlinDay(dateKey)}" messages="${stats.messageCount}" users="${stats.uniqueUsers}">`)
    lines.push(`summary: ${ai.summary}`)
    lines.push(`topics: ${ai.topics.join(' | ')}`)
    lines.push(`sentiment: ${ai.sentiment.score}/100 (${ai.sentiment.label})`)
    if (btc) {
      lines.push(`btc: open $${Math.round(btc.open)} -> close $${Math.round(btc.close)} (high $${Math.round(btc.high)}, low $${Math.round(btc.low)})`)
    }
    if (ai.btcNote) lines.push(`btc_note: ${ai.btcNote}`)
    if (ai.keyEvents.length > 0) {
      lines.push('events:')
      for (const event of ai.keyEvents) {
        lines.push(`- ${event.title}: ${event.description} [${event.participants.join(', ')}]`)
      }
    }
    if (ai.notableQuotes.length > 0) {
      lines.push('quotes:')
      for (const quote of ai.notableQuotes) {
        lines.push(`- @${quote.username}${quote.time ? ` (${quote.time})` : ''}: "${quote.text}"`)
      }
    }
    if (ai.topUsers.length > 0) lines.push(`top_users: ${ai.topUsers.join(', ')}`)
    lines.push('</day>')
  }

  lines.push('</chat-digests>')
  return lines.join('\n')
}

export function formatRecentChatSection(rawDateKeys: string[], messages: V2ChatMessage[]): string {
  const lines: string[] = [
    `<chat-recent timezone="Europe/Berlin" days="${rawDateKeys.join(', ')}" messages="${messages.length}">`,
    '(Voller Text, keine Kuerzung — die juengsten Tage im Original.)'
  ]

  if (messages.length === 0) {
    lines.push('[keine Nachrichten]')
  } else {
    for (const message of messages) {
      const time = new Date(message.time)
      const berlinTime = time.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: NEWSPAPER_TIME_ZONE
      })
      lines.push(`[${time.toISOString()} | Berlin ${berlinTime} | @${message.username} | mod=${Boolean(message.is_moderator)}] ${message.text}`)
    }
  }

  lines.push('</chat-recent>')
  return lines.join('\n')
}

function formatCandleSeries(data: V2Data): string {
  if (data.btc.candles.length === 0) return 'Keine Kerzendaten verfuegbar.'

  return data.btc.candles
    .map(candle => {
      const date = new Date(candle.timestamp).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        timeZone: NEWSPAPER_TIME_ZONE
      })
      return `${date}: O ${Math.round(candle.open)} H ${Math.round(candle.high)} L ${Math.round(candle.low)} C ${Math.round(candle.close)}`
    })
    .join('\n')
}

export function formatMarketSection(params: {
  btcContext: V2BTCContext | null
  v2Data: V2Data
  leaderboardPrompt: string
}): string {
  const { btcContext, v2Data, leaderboardPrompt } = params
  const lines: string[] = ['<market>']

  lines.push('## BTC aktuell')
  if (btcContext) {
    lines.push(`Preis: $${btcContext.currentPrice.toLocaleString('de-DE')} (€${btcContext.priceEUR.toLocaleString('de-DE')})`)
    lines.push(`24h: ${btcContext.change24h}% | 7d: ${btcContext.change7d}% | 30d: ${btcContext.change30d}%`)
    lines.push(`ATH: $${btcContext.athPrice.toLocaleString('de-DE')} (${btcContext.athDate})`)
  } else {
    lines.push('BTC-Kontext nicht verfuegbar.')
  }

  lines.push('')
  lines.push(`## BTC 4H-Kerzen (letzte ${v2Data.range.days} Tage, ${v2Data.btc.candles.length} Kerzen)`)
  lines.push(formatCandleSeries(v2Data))

  lines.push('')
  lines.push('## Chat-Sentiment pro Tag (aus den Tagesdigests, 0=extrem bearish, 100=extrem bullish)')
  if (v2Data.sentimentSeries.length === 0) {
    lines.push('Keine Sentiment-Serie verfuegbar.')
  } else {
    for (const point of v2Data.sentimentSeries) {
      lines.push(`${point.date}: ${point.score}/100 (${point.label})${point.btcClose ? ` | BTC Close $${Math.round(point.btcClose)}` : ''}`)
    }
  }

  lines.push('')
  lines.push('## Chat-Aktivitaet pro Tag')
  for (const point of v2Data.activitySeries) {
    lines.push(`${point.date}: ${point.messageCount} Nachrichten, ${point.uniqueUsers} User`)
  }

  lines.push('')
  lines.push('## Fear & Greed Historie (Community-Index)')
  if (v2Data.fearGreedHistory.length === 0) {
    lines.push('Keine Fear & Greed Historie verfuegbar.')
  } else {
    for (const point of v2Data.fearGreedHistory) {
      const date = new Date(point.createdAt).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        timeZone: NEWSPAPER_TIME_ZONE
      })
      lines.push(`${date}: ${point.todayIndex} (${point.todayClassificationDE}, Trend: ${point.trend})${point.insight ? ` — "${point.insight}"` : ''}`)
    }
  }

  lines.push('')
  lines.push('## Extrahierte Preis-Vorhersagen (Prediction Market)')
  if (v2Data.predictions.items.length === 0) {
    lines.push('Keine Vorhersagen im Cache.')
  } else {
    if (v2Data.predictions.summary) lines.push(`Zusammenfassung: ${v2Data.predictions.summary}`)
    for (const item of v2Data.predictions.items) {
      lines.push(`- @${item.username} (${item.direction}, ${item.confidence}): "${item.prediction}" | Ziel: ${item.targetPrice ? `$${item.targetPrice}` : 'n/a'} bis ${item.targetDateText} | BTC bei Call: $${Math.round(item.priceAtPrediction)} | ${item.timestamp}`)
    }
  }

  lines.push('')
  lines.push('## Trader-Leaderboard-Rohdaten (Calls mit BTC-Preis zum Zeitpunkt, letzte 30 Tage)')
  lines.push(leaderboardPrompt)

  lines.push('</market>')
  return lines.join('\n')
}

export function describeIssueRange(dateKeys: string[]): string {
  const first = dateKeys[0]
  const last = dateKeys[dateKeys.length - 1]
  const fmt = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: NEWSPAPER_TIME_ZONE
  })
  return `${fmt(first)} bis ${fmt(last)}`
}

export function getWeekWindows(dateKeys: string[]): Array<{ label: string; start: string; end: string }> {
  const windows: Array<{ label: string; start: string; end: string }> = []
  // Split the 30-day window into ~4 weeks, oldest first.
  const chunk = Math.ceil(dateKeys.length / 4)
  for (let i = 0; i < dateKeys.length; i += chunk) {
    const slice = dateKeys.slice(i, i + chunk)
    const fmt = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      timeZone: NEWSPAPER_TIME_ZONE
    })
    windows.push({
      label: `Woche ${windows.length + 1} (${fmt(slice[0])} - ${fmt(slice[slice.length - 1])})`,
      start: slice[0],
      end: slice[slice.length - 1]
    })
  }
  return windows
}

export function getRecentRawWindow(days = V2_RAW_DAYS): { startKey: string; endKey: string } {
  const today = getNewspaperDateKey()
  return { startKey: addDaysToDateKey(today, -(days - 1)), endKey: today }
}
