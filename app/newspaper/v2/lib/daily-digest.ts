/**
 * daily-digest.ts (Newspaper v2 — Stage 1)
 *
 * Generates and caches one compact digest per Berlin day. Past days are
 * immutable and cached forever; today's digest gets a short TTL.
 * A single digest call sends the FULL day of chat (no truncation) to the
 * model and receives a rich structured summary back.
 */

import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import type { createClient } from '@/lib/supabase/server'
import {
  addDaysToDateKey,
  getNewspaperDateKey,
  getNewspaperDayBounds,
  NEWSPAPER_TIME_ZONE
} from '../../lib/timezone'
import {
  DigestAISchema,
  V2_DAYS,
  V2_MODEL,
  type DailyDigestData,
  type DailyDigestRow
} from './types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

const TODAY_DIGEST_TTL_MS = 6 * 60 * 60 * 1000

export interface V2ChatMessage {
  username: string
  text: string
  time: string
  is_moderator?: boolean | null
  user_pic?: string | null
}

export async function fetchMessagesForRange(
  supabase: SupabaseServerClient,
  startDate: Date,
  endDate: Date
): Promise<V2ChatMessage[]> {
  const messages: V2ChatMessage[] = []
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

export function getV2DateKeys(days = V2_DAYS): string[] {
  const today = getNewspaperDateKey()
  const keys: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    keys.push(addDaysToDateKey(today, -i))
  }
  return keys
}

function formatDayMessages(messages: V2ChatMessage[]): string {
  if (messages.length === 0) return '[keine Nachrichten]'
  return messages
    .map(message => {
      const time = new Date(message.time)
      const berlinTime = time.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: NEWSPAPER_TIME_ZONE
      })
      return `[${time.toISOString()} | Berlin ${berlinTime} | @${message.username} | mod=${Boolean(message.is_moderator)}] ${message.text}`
    })
    .join('\n')
}

export function buildDigestPrompt(params: {
  dateKey: string
  messages: V2ChatMessage[]
  btc: DailyDigestData['btc']
}): string {
  const uniqueUsers = new Set(params.messages.map(m => m.username)).size
  const btcLine = params.btc
    ? `BTC an diesem Tag: Open $${Math.round(params.btc.open)}, Close $${Math.round(params.btc.close)}, High $${Math.round(params.btc.high)}, Low $${Math.round(params.btc.low)}`
    : 'BTC-Preisdaten fuer diesen Tag nicht verfuegbar.'

  return `Du bist Archivar der "Financial Retarded Times". Verdichte einen kompletten Chat-Tag zu einem reichhaltigen Tagesdigest, der spaeter als Quelle fuer die Monatsausgabe dient.

REGELN:
- Sprache: Deutsch. Ton: neutral, trocken, analytisch.
- Nachrichten die mit "//" und einem Preis beginnen sind Rate-Chart-Game-Tipps: KOMPLETT IGNORIEREN, niemals erwaehnen.
- Zitate muessen EXAKT dem Original entsprechen (inklusive Tippfehler). Zu jedem Zitat den ISO-Zeitstempel der Original-Nachricht angeben.
- Sei grosszuegig: lieber ein detailreicher Digest als ein karger. Erfasse Marktmeinungen, Beef, Running Gags, gute/schlechte Calls, menschliche Momente.
- sentiment.score: 0 = extrem bearish, 50 = neutral, 100 = extrem bullish (Stimmung des Chats, nicht des Preises).

TAG: ${params.dateKey} (Europe/Berlin)
NACHRICHTEN: ${params.messages.length} von ${uniqueUsers} Usern
${btcLine}

--- CHAT-VERLAUF (kompletter Tag) ---
${formatDayMessages(params.messages)}
--- ENDE ---

Erstelle jetzt den Tagesdigest.`
}

function computeDayBTC(
  candles: Array<{ timestamp: number; open: number; high: number; low: number; close: number }>,
  dateKey: string
): DailyDigestData['btc'] {
  const { startDate, endDate } = getNewspaperDayBounds(dateKey)
  const dayCandles = candles.filter(
    c => c.timestamp >= startDate.getTime() && c.timestamp <= endDate.getTime()
  )
  if (dayCandles.length === 0) return null

  return {
    open: dayCandles[0].open,
    close: dayCandles[dayCandles.length - 1].close,
    high: Math.max(...dayCandles.map(c => c.high)),
    low: Math.min(...dayCandles.map(c => c.low))
  }
}

async function fetchHourlyCandles(supabase: SupabaseServerClient): Promise<Array<{ timestamp: number; open: number; high: number; low: number; close: number }>> {
  try {
    const { data } = await supabase
      .from('chart_timeline_ohlc_cache')
      .select('candles')
      .eq('timeframe', '1H')
      .single()

    if (data?.candles && Array.isArray(data.candles)) {
      return data.candles
    }
  } catch {
    // fall through
  }

  try {
    const res = await fetch(
      'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=1000',
      { cache: 'no-store' }
    )
    if (!res.ok) return []
    type BinanceKline = [number, string, string, string, string, ...unknown[]]
    const raw: BinanceKline[] = await res.json()
    return raw.map(k => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4])
    }))
  } catch {
    return []
  }
}

function mapDigestRow(row: {
  digest_date: string
  data: unknown
  message_count: number
  unique_users: number
  model: string
  updated_at: string
}): DailyDigestRow {
  return {
    digestDate: row.digest_date,
    data: row.data as DailyDigestData,
    messageCount: row.message_count,
    uniqueUsers: row.unique_users,
    model: row.model,
    updatedAt: row.updated_at
  }
}

export async function readDigests(
  supabase: SupabaseServerClient,
  dateKeys: string[]
): Promise<Map<string, DailyDigestRow>> {
  const result = new Map<string, DailyDigestRow>()
  if (dateKeys.length === 0) return result

  const { data, error } = await supabase
    .from('newspaper_v2_daily_digests')
    .select('digest_date, data, message_count, unique_users, model, updated_at')
    .in('digest_date', dateKeys)

  if (error) {
    // Table may not exist yet — treat as no digests.
    console.error('[V2-DIGEST] Read error:', error.message)
    return result
  }

  for (const row of data ?? []) {
    result.set(row.digest_date, mapDigestRow(row))
  }
  return result
}

function isTodayDigestFresh(row: DailyDigestRow): boolean {
  return Date.now() - new Date(row.updatedAt).getTime() < TODAY_DIGEST_TTL_MS
}

/**
 * Which of the requested days still need a (re-)generated digest.
 * Past days: missing only. Today: missing or older than TODAY_DIGEST_TTL_MS.
 */
export function findMissingDigestDays(
  dateKeys: string[],
  existing: Map<string, DailyDigestRow>
): string[] {
  const today = getNewspaperDateKey()
  return dateKeys.filter(key => {
    const row = existing.get(key)
    if (!row) return true
    if (key === today) return !isTodayDigestFresh(row)
    return false
  })
}

export async function generateDailyDigest(
  supabase: SupabaseServerClient,
  dateKey: string,
  hourlyCandles?: Array<{ timestamp: number; open: number; high: number; low: number; close: number }>
): Promise<DailyDigestRow | null> {
  const { startDate, endDate } = getNewspaperDayBounds(dateKey)
  const messages = await fetchMessagesForRange(supabase, startDate, endDate)
  const candles = hourlyCandles ?? await fetchHourlyCandles(supabase)
  const btc = computeDayBTC(candles, dateKey)
  const uniqueUsers = new Set(messages.map(m => m.username)).size

  let digestData: DailyDigestData

  if (messages.length === 0) {
    digestData = {
      ai: {
        summary: 'Keine Chat-Nachrichten an diesem Tag.',
        topics: ['Ruhetag'],
        sentiment: { score: 50, label: 'neutral' },
        notableQuotes: [],
        keyEvents: [],
        topUsers: [],
        btcNote: null
      },
      stats: { messageCount: 0, uniqueUsers: 0 },
      btc
    }
  } else {
    const prompt = buildDigestPrompt({ dateKey, messages, btc })
    const { object } = await generateObject({
      model: openai(V2_MODEL),
      schema: DigestAISchema,
      providerOptions: { openai: { reasoning: { effort: 'low' } } },
      prompt
    })

    digestData = {
      ai: object,
      stats: { messageCount: messages.length, uniqueUsers },
      btc
    }
  }

  const updatedAt = new Date().toISOString()
  const { error } = await supabase
    .from('newspaper_v2_daily_digests')
    .upsert({
      digest_date: dateKey,
      data: digestData,
      message_count: messages.length,
      unique_users: uniqueUsers,
      model: V2_MODEL,
      updated_at: updatedAt
    }, { onConflict: 'digest_date' })

  if (error) {
    console.error('[V2-DIGEST] Write error:', dateKey, error.message)
    return null
  }

  return {
    digestDate: dateKey,
    data: digestData,
    messageCount: messages.length,
    uniqueUsers,
    model: V2_MODEL,
    updatedAt
  }
}

export interface DigestStatus {
  days: number
  covered: number
  missing: string[]
  coverage: Array<{
    date: string
    hasDigest: boolean
    messageCount: number
    uniqueUsers: number
    updatedAt: string | null
  }>
}

export async function getDigestStatus(
  supabase: SupabaseServerClient,
  days = V2_DAYS
): Promise<DigestStatus> {
  const dateKeys = getV2DateKeys(days)
  const existing = await readDigests(supabase, dateKeys)
  const missing = findMissingDigestDays(dateKeys, existing)

  return {
    days,
    covered: dateKeys.length - missing.length,
    missing,
    coverage: dateKeys.map(date => {
      const row = existing.get(date)
      return {
        date,
        hasDigest: Boolean(row) && !missing.includes(date),
        messageCount: row?.messageCount ?? 0,
        uniqueUsers: row?.uniqueUsers ?? 0,
        updatedAt: row?.updatedAt ?? null
      }
    })
  }
}

/**
 * Generates digests for up to `maxPerRun` missing days (oldest first, bounded
 * concurrency). Returns how many are still missing so callers can loop.
 */
export async function ensureDigests(
  supabase: SupabaseServerClient,
  options: { days?: number; maxPerRun?: number; concurrency?: number } = {}
): Promise<{ generated: string[]; remaining: string[] }> {
  const days = options.days ?? V2_DAYS
  const maxPerRun = options.maxPerRun ?? 5
  const concurrency = options.concurrency ?? 3

  const dateKeys = getV2DateKeys(days)
  const existing = await readDigests(supabase, dateKeys)
  const missing = findMissingDigestDays(dateKeys, existing)
  if (missing.length === 0) return { generated: [], remaining: [] }

  const batch = missing.slice(0, maxPerRun)
  const hourlyCandles = await fetchHourlyCandles(supabase)
  const generated: string[] = []

  for (let i = 0; i < batch.length; i += concurrency) {
    const slice = batch.slice(i, i + concurrency)
    const results = await Promise.allSettled(
      slice.map(dateKey => generateDailyDigest(supabase, dateKey, hourlyCandles))
    )
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        generated.push(slice[index])
      } else if (result.status === 'rejected') {
        console.error('[V2-DIGEST] Generation failed:', slice[index], result.reason)
      }
    })
  }

  return {
    generated,
    remaining: missing.filter(key => !generated.includes(key))
  }
}
