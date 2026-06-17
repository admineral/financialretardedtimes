/**
 * route.ts (Sentiment Analysis API)
 *
 * AI-powered sentiment scoring of BTC chat messages over time.
 * Uses streamObject for live streaming to the client.
 *
 * ENDPOINT:
 * - GET  /chart-timeline/sentiment/api/sentiment          → cached data
 * - POST /chart-timeline/sentiment/api/sentiment          → fresh streaming AI analysis
 * - POST /chart-timeline/sentiment/api/sentiment?force=true → force fresh (bypass cache)
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { openai } from '@ai-sdk/openai'
import { streamObject } from 'ai'
import { z } from 'zod'

// ------- Schemas -------

const SentimentBucketSchema = z.object({
  timestamp: z.string(),
  bullishScore: z.number().min(0).max(100),
  bearishScore: z.number().min(0).max(100),
  netSentiment: z.number().min(-100).max(100),
  messageCount: z.number(),
  fearGreed: z.enum(['extreme_fear', 'fear', 'neutral', 'greed', 'extreme_greed']),
  dominantKeywords: z.array(z.string()).max(3),
  priceAtBucket: z.number().optional(),
})

const SentimentResponseSchema = z.object({
  timeRange: z.object({
    from: z.string(),
    to: z.string(),
    totalMessages: z.number(),
  }),
  buckets: z.array(SentimentBucketSchema),
  overallSentiment: z.object({
    avgNetSentiment: z.number(),
    trend: z.enum(['bullish', 'bearish', 'neutral']),
    peakBullish: z.object({ timestamp: z.string(), score: z.number() }),
    peakBearish: z.object({ timestamp: z.string(), score: z.number() }),
    summary: z.string(),
  }),
  sentimentDivergences: z.array(z.object({
    timestamp: z.string(),
    type: z.enum(['price_up_sentiment_down', 'price_down_sentiment_up', 'capitulation', 'euphoria']),
    description: z.string(),
    priceChange: z.number().optional(),
  })).max(5),
})

export type SentimentResponse = z.infer<typeof SentimentResponseSchema>

interface OHLCData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

interface ChatMessage {
  id: string
  username: string
  text: string
  time: string
}

// ------- Helpers -------

function isCacheValid(updatedAt: string, ttlMinutes = 360): boolean {
  const diffMinutes = (Date.now() - new Date(updatedAt).getTime()) / 60000
  console.log(`[SENTIMENT] Cache age: ${Math.round(diffMinutes)}min (TTL: ${ttlMinutes}min)`)
  return diffMinutes < ttlMinutes
}

async function fetchRecentMessages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  daysBack = 7
): Promise<{ messages: ChatMessage[]; from: string; to: string }> {
  const now = new Date()
  const from = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000)

  const allMessages: ChatMessage[] = []
  let lastTime: string | null = null
  let batchCount = 0
  const BATCH_SIZE = 1000
  const MAX_BATCHES = 10 // max 10,000 messages

  try {
    while (batchCount < MAX_BATCHES) {
      let query = supabase
        .from('tv_chat_messages')
        .select('id, username, text, time')
        .gte('time', from.toISOString())
        .lte('time', now.toISOString())
        .not('text', 'is', null)
        .order('time', { ascending: true })
        .limit(BATCH_SIZE)

      if (lastTime) {
        query = query.gt('time', lastTime)
      }

      const { data: batch, error } = await query

      if (error) {
        console.error('[SENTIMENT] Batch fetch error:', error)
        break
      }

      if (!batch || batch.length === 0) break

      allMessages.push(...(batch as ChatMessage[]))
      lastTime = batch[batch.length - 1].time
      batchCount++

      console.log(`[SENTIMENT] Batch ${batchCount}: ${batch.length} msgs (total: ${allMessages.length})`)

      if (batch.length < BATCH_SIZE) break // last partial batch
    }
  } catch (err) {
    console.error('[SENTIMENT] Message fetch error:', err)
  }

  return {
    messages: allMessages.filter((m) => m.text?.trim().length > 2),
    from: from.toISOString(),
    to: now.toISOString(),
  }
}

async function fetchOHLCData(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<OHLCData[]> {
  try {
    const { data: cached } = await supabase
      .from('chart_timeline_ohlc_cache')
      .select('candles')
      .eq('timeframe', '1H')
      .single()

    if (cached?.candles && Array.isArray(cached.candles)) {
      return cached.candles as OHLCData[]
    }

    const url = 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=168'
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) return []

    type BinanceKline = [number, string, string, string, string, ...unknown[]]
    const rawData: BinanceKline[] = await response.json()
    return rawData.map((k) => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
    }))
  } catch {
    return []
  }
}

function groupMessagesByBucket(
  messages: ChatMessage[],
  bucketHours = 4
): Map<string, ChatMessage[]> {
  const bucketMs = bucketHours * 60 * 60 * 1000
  const groups = new Map<string, ChatMessage[]>()

  for (const msg of messages) {
    const bucketTs = Math.floor(new Date(msg.time).getTime() / bucketMs) * bucketMs
    const key = new Date(bucketTs).toISOString()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(msg)
  }

  return groups
}

function getPriceAtTime(timestamp: string, ohlcData: OHLCData[]): number | undefined {
  if (ohlcData.length === 0) return undefined
  const ts = new Date(timestamp).getTime()
  let closest = ohlcData[0]
  let minDiff = Math.abs(closest.timestamp - ts)

  for (const candle of ohlcData) {
    const diff = Math.abs(candle.timestamp - ts)
    if (diff < minDiff) { minDiff = diff; closest = candle }
  }

  return closest.close
}

// ------- GET: return cached data -------

export async function GET() {
  const supabase = await createClient()

  try {
    const { data: cached, error } = await supabase
      .from('sentiment_analysis_cache')
      .select('data, updated_at')
      .eq('cache_key', 'sentiment_7d_4h')
      .single()

    if (error) {
      console.log('[SENTIMENT GET] No cache row found:', error.message)
      return NextResponse.json({ cached: false, buckets: [] })
    }

    if (!cached?.data) {
      console.log('[SENTIMENT GET] Cache row exists but data is null')
      return NextResponse.json({ cached: false, buckets: [] })
    }

    if (!isCacheValid(cached.updated_at)) {
      console.log('[SENTIMENT GET] Cache expired, returning stale data anyway')
      // Return stale data — better than nothing on page load
      return NextResponse.json({
        cached: true,
        stale: true,
        fetchedAt: cached.updated_at,
        ...cached.data,
      })
    }

    console.log('[SENTIMENT GET] Returning fresh cached analysis')
    return NextResponse.json({
      cached: true,
      fetchedAt: cached.updated_at,
      ...cached.data,
    })
  } catch (err) {
    console.error('[SENTIMENT GET] Unexpected error:', err)
  }

  return NextResponse.json({ cached: false, buckets: [] })
}

// ------- POST: stream fresh AI analysis -------

export async function POST() {
  const supabase = await createClient()

  const [{ messages, from, to }, ohlcData] = await Promise.all([
    fetchRecentMessages(supabase, 7),
    fetchOHLCData(supabase),
  ])

  if (messages.length === 0) {
    return NextResponse.json({ error: 'Keine Nachrichten gefunden' }, { status: 404 })
  }

  const buckets = groupMessagesByBucket(messages, 4)
  const bucketEntries = Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b))

  const bucketSummaries = bucketEntries.slice(-42).map(([ts, msgs]) => {
    const sample = msgs.slice(0, 20).map((m) => `${m.username}: ${m.text}`).join('\n')
    const price = getPriceAtTime(ts, ohlcData)
    return `### Bucket: ${ts} (${msgs.length} msgs${price ? `, BTC: $${Math.round(price)}` : ''})\n${sample}`
  })

  const prompt = `Du bist ein quantitativer Sentiment-Analyst für BTC Trading-Chat.

Analysiere die folgenden Chat-Nachrichten aus dem BTC TradingView-Chat und erstelle für jeden Zeitraum (Bucket) einen Sentiment-Score.

**Scoring-Regeln:**
- bullishScore 0-100: Wie stark ist die bullische Stimmung (Calls, FOMO, Euphorie)
- bearishScore 0-100: Wie stark ist die bärische Stimmung (Panik, Dump-Calls, Angst)
- netSentiment = bullishScore - bearishScore (Bereich -100 bis +100)
- fearGreed: extreme_fear (<-60), fear (-60 bis -20), neutral (-20 bis 20), greed (20 bis 60), extreme_greed (>60)
- dominantKeywords: 2-3 häufigste Begriffe/Phrasen

**Identifiziere außerdem bis zu 5 Sentiment-Divergenzen:**
- Wenn Preis steigt aber Sentiment fällt → "price_up_sentiment_down"
- Wenn Preis fällt aber Sentiment steigt → "price_down_sentiment_up"
- Kapitulation: Extremes bearisches Sentiment an Tiefpunkt
- Euphorie: Extremes bullisches Sentiment an Hochpunkt

Zeitraum: ${from} bis ${to}
Gesamt-Nachrichten: ${messages.length}

--- CHAT DATEN ---
${bucketSummaries.join('\n\n')}
--- ENDE ---

Gib eine vollständige Sentiment-Analyse zurück. Analysiere JEDEN Bucket. Starte sofort mit dem timeRange und dann den buckets.`

  const result = streamObject({
    model: openai('gpt-5.2'),
    schema: SentimentResponseSchema,
    prompt,
    providerOptions: { openai: { reasoning: { effort: 'high' } } },
    onFinish: async ({ object }) => {
      if (!object) return
      // Enrich with prices and cache
      const enriched = {
        ...object,
        buckets: object.buckets.map((b) => ({
          ...b,
          priceAtBucket: getPriceAtTime(b.timestamp, ohlcData) ?? b.priceAtBucket,
        })),
      }
      try {
        await supabase.from('sentiment_analysis_cache').upsert({
          cache_key: 'sentiment_7d_4h',
          data: enriched,
          bucket_count: enriched.buckets.length,
          message_count: enriched.timeRange?.totalMessages ?? 0,
          avg_net_sentiment: enriched.overallSentiment?.avgNetSentiment ?? null,
          trend: enriched.overallSentiment?.trend ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'cache_key' })
        console.log('[SENTIMENT] Cached', enriched.buckets.length, 'buckets')
      } catch (err) {
        console.error('[SENTIMENT] Cache save error:', err)
      }
    },
  })

  return result.toTextStreamResponse()
}
