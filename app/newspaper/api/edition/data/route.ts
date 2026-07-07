/**
 * Deterministic genui data API (Newspaper edition v3)
 *
 * GET /newspaper/api/edition/data?date=YYYY-MM-DD
 *
 * Recomputes the deterministic EditionData (candles per genui range,
 * Fear & Greed history, sentiment buckets, predictions) live from the
 * source caches — no AI involved. The UI can rebind dataComponent charts
 * to fresher numbers without touching the generated editorial content.
 * activitySeries/totals are reused from the stored edition row when
 * available (counting 14 days of messages just for a chart refresh would
 * be wasteful).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchCandlesByRange, getEditionDateKeys } from '../../../edition/context'
import { readEditionRow } from '../../../edition/store'
import { getNewspaperDateKey, getNewspaperDayBounds } from '../../../lib/timezone'
import { EDITION_WINDOW_DAYS, type EditionData } from '../../../edition/types'

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') || getNewspaperDateKey()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const dateKeys = getEditionDateKeys(date)
    const isToday = date === getNewspaperDateKey()
    const windowEnd = isToday ? new Date() : getNewspaperDayBounds(date).endDate
    const cutoff = new Date(Date.now() - EDITION_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const [candlesByRange, fearGreedResult, sentimentResult, predictionsResult, editionResult] = await Promise.all([
      fetchCandlesByRange(supabase, windowEnd),
      supabase
        .from('fear_greed_history')
        .select('created_at, today_index, today_classification_de, trend, insight')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: true })
        .limit(120),
      supabase
        .from('sentiment_analysis_cache')
        .select('data')
        .eq('cache_key', 'sentiment_7d_4h')
        .maybeSingle(),
      supabase
        .from('prediction_analysis_cache')
        .select('data, updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      readEditionRow(supabase, date, 1).catch(() => ({ kind: 'missing' as const }))
    ])

    const stored = editionResult.kind === 'edition' ? editionResult.row.edition.data : null

    const sentimentPayload = sentimentResult.data?.data as {
      buckets?: Array<{ timestamp: string; netSentiment: number; messageCount: number; priceAtBucket?: number }>
    } | null

    const predictionPayload = predictionsResult.data?.data as {
      predictions?: EditionData['predictions']['items']
      summary?: string
    } | null

    const candles14d = candlesByRange['14d']
    const lastCandle = candles14d[candles14d.length - 1]
    const firstCandle = candles14d[0]

    const data: EditionData = {
      window: { startDate: dateKeys[0], endDate: date, days: dateKeys.length },
      btc: {
        candlesByRange,
        currentPrice: lastCandle ? lastCandle.close : null,
        change14d: firstCandle && lastCandle
          ? Math.round(((lastCandle.close - firstCandle.open) / firstCandle.open) * 10000) / 100
          : null
      },
      fearGreedHistory: (fearGreedResult.data ?? []).map(row => ({
        createdAt: row.created_at,
        todayIndex: row.today_index,
        todayClassificationDE: row.today_classification_de,
        trend: row.trend,
        insight: row.insight
      })),
      sentimentSeries: (sentimentPayload?.buckets ?? []).map(bucket => ({
        timestamp: bucket.timestamp,
        netSentiment: bucket.netSentiment,
        messageCount: bucket.messageCount,
        priceAtBucket: bucket.priceAtBucket ?? null
      })),
      activitySeries: stored?.activitySeries ?? [],
      predictions: predictionPayload?.predictions
        ? {
            items: predictionPayload.predictions,
            summary: predictionPayload.summary ?? null,
            updatedAt: predictionsResult.data?.updated_at ?? null
          }
        : stored?.predictions ?? { items: [], summary: null, updatedAt: null },
      totals: stored?.totals ?? { messageCount: 0, uniqueUsers: 0, busiestDay: null }
    }

    return NextResponse.json({ data, computedAt: new Date().toISOString() }, {
      headers: { 'Cache-Control': 'no-store' }
    })
  } catch (error) {
    console.error('[EDITION-DATA] GET failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
