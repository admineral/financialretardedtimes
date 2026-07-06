/**
 * data.ts (Newspaper v2 — deterministic data layer)
 *
 * Computes every number the paper shows in its data components:
 * 30d BTC candles, sentiment series (from stage-1 digests), activity series,
 * Fear & Greed history, prediction recap. The AI never invents these values —
 * it only receives them as reading material and writes commentary.
 */

import type { createClient } from '@/lib/supabase/server'
import { getNewspaperDateKey, getNewspaperDayBounds } from '../../lib/timezone'
import {
  getV2DateKeys,
  readDigests,
  findMissingDigestDays
} from './daily-digest'
import {
  V2_DAYS,
  type DailyDigestRow,
  type V2Candle,
  type V2Data,
  type V2FearGreedPoint,
  type V2PredictionItem
} from './types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export async function fetchV2Candles(
  supabase: SupabaseServerClient,
  days = V2_DAYS
): Promise<V2Candle[]> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

  try {
    const { data: cached } = await supabase
      .from('chart_timeline_ohlc_cache')
      .select('candles')
      .eq('timeframe', '4H')
      .single()

    if (cached?.candles && Array.isArray(cached.candles)) {
      const filtered = (cached.candles as V2Candle[]).filter(c => c.timestamp >= cutoff)
      if (filtered.length >= 20) return filtered
    }
  } catch {
    // fall through
  }

  const limit = Math.min(days * 6 + 10, 1000)
  const mirrors = [
    `https://api1.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=${limit}`,
    `https://api2.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=${limit}`,
    `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=${limit}`
  ]

  type BinanceKline = [number, string, string, string, string, ...unknown[]]
  for (const url of mirrors) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) continue
      const raw: BinanceKline[] = await res.json()
      return raw
        .map(k => ({
          timestamp: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4])
        }))
        .filter(c => c.timestamp >= cutoff)
    } catch {
      continue
    }
  }

  return []
}

async function fetchFearGreedHistory(
  supabase: SupabaseServerClient,
  days = V2_DAYS
): Promise<V2FearGreedPoint[]> {
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

async function fetchPredictions(
  supabase: SupabaseServerClient
): Promise<V2Data['predictions']> {
  try {
    const { data } = await supabase
      .from('prediction_analysis_cache')
      .select('data, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const payload = data?.data as { predictions?: V2PredictionItem[]; summary?: string } | null
    if (!payload?.predictions) {
      return { items: [], summary: null, updatedAt: null }
    }

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

function closestDailyClose(candles: V2Candle[], dateKey: string): number | null {
  const { endDate } = getNewspaperDayBounds(dateKey)
  const dayEnd = endDate.getTime()
  let best: V2Candle | null = null
  for (const candle of candles) {
    if (candle.timestamp <= dayEnd && (!best || candle.timestamp > best.timestamp)) {
      best = candle
    }
  }
  return best ? best.close : null
}

export async function buildV2Data(
  supabase: SupabaseServerClient,
  options: { days?: number; digests?: Map<string, DailyDigestRow> } = {}
): Promise<V2Data> {
  const days = options.days ?? V2_DAYS
  const dateKeys = getV2DateKeys(days)
  const [digests, candles, fearGreedHistory, predictions] = await Promise.all([
    options.digests
      ? Promise.resolve(options.digests)
      : readDigests(supabase, dateKeys),
    fetchV2Candles(supabase, days),
    fetchFearGreedHistory(supabase, days),
    fetchPredictions(supabase)
  ])

  const missing = findMissingDigestDays(dateKeys, digests)
  const today = getNewspaperDateKey()

  const sentimentSeries = dateKeys
    .map(date => {
      const digest = digests.get(date)
      if (!digest) return null
      return {
        date,
        score: digest.data.ai.sentiment.score,
        label: digest.data.ai.sentiment.label,
        btcClose: digest.data.btc?.close ?? closestDailyClose(candles, date)
      }
    })
    .filter((point): point is NonNullable<typeof point> => point !== null)

  const activitySeries = dateKeys.map(date => {
    const digest = digests.get(date)
    return {
      date,
      messageCount: digest?.messageCount ?? 0,
      uniqueUsers: digest?.uniqueUsers ?? 0
    }
  })

  const totalsMessageCount = activitySeries.reduce((sum, p) => sum + p.messageCount, 0)
  const busiest = [...activitySeries].sort((a, b) => b.messageCount - a.messageCount)[0]
  const maxUsers = Math.max(...activitySeries.map(p => p.uniqueUsers), 0)

  const rangeStart = getNewspaperDayBounds(dateKeys[0]).startDate.toISOString()
  const rangeEnd = getNewspaperDayBounds(dateKeys[dateKeys.length - 1]).endDate.toISOString()

  const lastCandle = candles[candles.length - 1]
  const firstCandle = candles[0]
  const change30d = firstCandle && lastCandle
    ? Math.round(((lastCandle.close - firstCandle.open) / firstCandle.open) * 10000) / 100
    : null

  return {
    range: { startDate: rangeStart, endDate: rangeEnd, days },
    btc: {
      candles,
      currentPrice: lastCandle ? lastCandle.close : null,
      change30d
    },
    sentimentSeries,
    activitySeries,
    fearGreedHistory,
    predictions,
    digestCoverage: dateKeys.map(date => {
      const digest = digests.get(date)
      return {
        date,
        hasDigest: Boolean(digest) && (!missing.includes(date) || date === today),
        messageCount: digest?.messageCount ?? 0,
        uniqueUsers: digest?.uniqueUsers ?? 0
      }
    }),
    totals: {
      messageCount: totalsMessageCount,
      uniqueUsers: maxUsers,
      busiestDay: busiest && busiest.messageCount > 0 ? busiest.date : null
    }
  }
}
