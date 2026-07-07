'use client'

/**
 * SentimentWidget — full BTC chat sentiment analysis as a reusable,
 * newspaper-styled widget: sentiment candles vs. BTC price, 7-day score,
 * AI summary, divergences and a live streaming regenerate (same endpoint
 * as /chart-timeline/sentiment).
 */

import { experimental_useObject as useObject } from '@ai-sdk/react'
import { AlertTriangle, BarChart2, Minus, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import {
  clipOhlcToWindow,
  fetchOhlc,
  isOlderThanHours,
  pickTimeframeForRange,
  type OHLCData
} from './lib'
import { ChartSkeleton, WidgetEmptyState, WidgetFrame } from './WidgetFrame'

const SentimentCandlestickChart = dynamic(
  () => import('@/app/chart-timeline/sentiment/components/SentimentCandlestickChart').then(mod => mod.SentimentCandlestickChart),
  { ssr: false, loading: () => <ChartSkeleton height={340} /> }
)

// Must match /chart-timeline/sentiment/api/sentiment (server emits null
// for absent fields, old caches may omit them → nullish accepts both)
const SentimentBucketSchema = z.object({
  timestamp: z.string(),
  bullishScore: z.number(),
  bearishScore: z.number(),
  netSentiment: z.number(),
  messageCount: z.number(),
  fearGreed: z.enum(['extreme_fear', 'fear', 'neutral', 'greed', 'extreme_greed']),
  dominantKeywords: z.array(z.string()),
  priceAtBucket: z.number().nullish()
})

const SentimentResponseSchema = z.object({
  timeRange: z.object({ from: z.string(), to: z.string(), totalMessages: z.number() }),
  buckets: z.array(SentimentBucketSchema),
  overallSentiment: z.object({
    avgNetSentiment: z.number(),
    trend: z.enum(['bullish', 'bearish', 'neutral']),
    peakBullish: z.object({ timestamp: z.string(), score: z.number() }),
    peakBearish: z.object({ timestamp: z.string(), score: z.number() }),
    summary: z.string()
  }),
  sentimentDivergences: z.array(z.object({
    timestamp: z.string(),
    type: z.enum(['price_up_sentiment_down', 'price_down_sentiment_up', 'capitulation', 'euphoria']),
    description: z.string(),
    priceChange: z.number().nullish()
  }))
})

type SentimentBucket = z.infer<typeof SentimentBucketSchema>
type SentimentResponse = z.infer<typeof SentimentResponseSchema>

const DIVERGENCE_LABELS: Record<string, string> = {
  price_up_sentiment_down: 'Preis ↑, Stimmung ↓',
  price_down_sentiment_up: 'Preis ↓, Stimmung ↑',
  capitulation: 'Kapitulation',
  euphoria: 'Euphorie'
}

function sentimentColor(net: number): string {
  if (net >= 20) return 'text-emerald-400'
  if (net <= -20) return 'text-red-400'
  return 'text-amber-400'
}

function TrendBadge({ trend, avgNet }: { trend: string; avgNet: number }) {
  const Icon = trend === 'bullish' ? TrendingUp : trend === 'bearish' ? TrendingDown : Minus
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-sm border border-primary/25 bg-background/40 px-2.5 py-1 font-mono text-xs font-semibold ${sentimentColor(avgNet)}`}>
      <Icon className="h-3.5 w-3.5" />
      {avgNet >= 0 ? '+' : ''}{avgNet.toFixed(0)}
    </span>
  )
}

function isCompleteBucket(bucket: unknown): bucket is SentimentBucket {
  const b = bucket as Partial<SentimentBucket> | undefined
  return Boolean(b && typeof b.timestamp === 'string' && typeof b.netSentiment === 'number'
    && typeof b.bullishScore === 'number' && typeof b.bearishScore === 'number')
}

export function SentimentWidget() {
  const [cached, setCached] = useState<SentimentResponse | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [serverStale, setServerStale] = useState(false)
  const [ohlcData, setOhlcData] = useState<OHLCData[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const { object: streaming, isLoading: isGenerating, submit: runAnalysis } = useObject({
    api: '/chart-timeline/sentiment/api/sentiment',
    schema: SentimentResponseSchema
  })

  const loadCached = useCallback(async (): Promise<SentimentResponse | null> => {
    try {
      const res = await fetch('/chart-timeline/sentiment/api/sentiment')
      if (!res.ok) return null
      const json = await res.json()
      if (!json.cached || !Array.isArray(json.buckets)) return null
      const data: SentimentResponse = {
        timeRange: json.timeRange ?? { from: '', to: '', totalMessages: 0 },
        buckets: json.buckets.filter(isCompleteBucket),
        overallSentiment: json.overallSentiment ?? null,
        sentimentDivergences: Array.isArray(json.sentimentDivergences) ? json.sentimentDivergences : []
      }
      setCached(data)
      setFetchedAt(typeof json.fetchedAt === 'string' ? json.fetchedAt : null)
      setServerStale(Boolean(json.stale))
      return data
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      const data = await loadCached()
      try {
        const bucketTimes = (data?.buckets ?? [])
          .map(b => new Date(b.timestamp).getTime())
          .filter(Number.isFinite)
        const oldest = bucketTimes.length > 0 ? Math.min(...bucketTimes) : Date.now() - 7 * 24 * 3600 * 1000
        const { ohlc } = await fetchOhlc(pickTimeframeForRange(oldest))
        if (!cancelled) setOhlcData(clipOhlcToWindow(ohlc, oldest, Date.now()))
      } catch (err) {
        console.warn('[SentimentWidget] OHLC load failed:', err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [loadCached])

  const regenerate = useCallback(async () => {
    try {
      const { ohlc } = await fetchOhlc('1H', true)
      setOhlcData(clipOhlcToWindow(ohlc, Date.now() - 7 * 24 * 3600 * 1000, Date.now()))
    } catch {
      // keep old candles
    }
    runAnalysis({})
  }, [runAnalysis])

  // When the stream finishes, re-read the cache: the server enriches the
  // buckets with priceAtBucket before persisting.
  useEffect(() => {
    if (!isGenerating && streaming?.buckets && streaming.buckets.length > 0) {
      loadCached().then(() => setFetchedAt(new Date().toISOString()))
    }
  }, [isGenerating, streaming, loadCached])

  const live = streaming as Partial<SentimentResponse> | undefined
  const buckets = useMemo(() => {
    const raw: SentimentBucket[] = isGenerating && live?.buckets
      ? live.buckets.filter(isCompleteBucket)
      : cached?.buckets ?? []
    // SentimentCandlestickChart expects priceAtBucket?: number (no null)
    return raw.map(bucket => ({ ...bucket, priceAtBucket: bucket.priceAtBucket ?? undefined }))
  }, [isGenerating, live, cached])

  const overall = (isGenerating ? live?.overallSentiment : null) ?? cached?.overallSentiment ?? null
  const divergences = (isGenerating ? live?.sentimentDivergences : null) ?? cached?.sentimentDivergences ?? []

  const trendLabel = overall?.trend === 'bullish' ? 'Bullisch' : overall?.trend === 'bearish' ? 'Bärisch' : 'Neutral'
  const stale = serverStale || isOlderThanHours(fetchedAt, 12)

  return (
    <WidgetFrame
      icon={BarChart2}
      kicker="Stimmungsbarometer"
      title="BTC Sentiment"
      fetchedAt={fetchedAt}
      stale={stale}
      fullscreenHref="/chart-timeline/sentiment"
      onRegenerate={regenerate}
      isGenerating={isGenerating}
      statusText={cached?.timeRange?.totalMessages ? `${cached.timeRange.totalMessages.toLocaleString('de-DE')} Nachrichten · 4h-Buckets` : null}
    >
      {overall && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <TrendBadge trend={overall.trend} avgNet={overall.avgNetSentiment ?? 0} />
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-headline">{trendLabel}</span>
        </div>
      )}

      {/* Chart */}
      <div className="overflow-hidden rounded-sm border border-primary/15 bg-background/50" style={{ height: 340 }}>
        {isLoading ? (
          <ChartSkeleton height={340} />
        ) : buckets.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <WidgetEmptyState
              icon={BarChart2}
              text="Noch keine Sentiment-Daten. Jetzt eine frische Analyse generieren?"
              actionLabel="Analyse starten"
              onAction={regenerate}
            />
          </div>
        ) : (
          <SentimentCandlestickChart buckets={buckets} ohlcData={ohlcData} />
        )}
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col items-center justify-center gap-1 rounded-sm border border-primary/15 bg-background/40 p-4">
          <span className="text-[10px] font-headline uppercase tracking-[0.2em] text-muted-foreground">7-Tage Sentiment</span>
          {overall ? (
            <>
              <span className={`font-mono text-3xl font-bold ${sentimentColor(overall.avgNetSentiment ?? 0)}`}>
                {(overall.avgNetSentiment ?? 0) >= 0 ? '+' : ''}{(overall.avgNetSentiment ?? 0).toFixed(0)}
              </span>
              <span className="text-xs text-muted-foreground">{trendLabel}</span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground/60 italic">Keine Daten</span>
          )}
        </div>

        <div className="rounded-sm border border-primary/15 bg-background/40 p-4">
          <div className="mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-primary/70" />
            <span className="text-[10px] font-headline uppercase tracking-[0.2em] text-muted-foreground">AI-Zusammenfassung</span>
          </div>
          {overall?.summary ? (
            <p className="line-clamp-4 font-body text-xs italic leading-relaxed text-foreground/80">{overall.summary}</p>
          ) : isGenerating ? (
            <div className="animate-pulse space-y-1.5">
              <div className="h-2.5 w-full rounded bg-muted/40" />
              <div className="h-2.5 w-4/5 rounded bg-muted/40" />
              <div className="h-2.5 w-3/5 rounded bg-muted/40" />
            </div>
          ) : (
            <p className="text-xs italic text-muted-foreground/60">Keine Zusammenfassung</p>
          )}
        </div>

        <div className="rounded-sm border border-primary/15 bg-background/40 p-4">
          <span className="mb-2 block text-[10px] font-headline uppercase tracking-[0.2em] text-muted-foreground">Letzte Buckets</span>
          {buckets.length > 0 ? (
            <div className="flex flex-wrap gap-0.5">
              {buckets.slice(-14).map((bucket, index) => (
                <div
                  key={index}
                  title={`${new Date(bucket.timestamp).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', timeZone: 'Europe/Berlin' })} — ${bucket.netSentiment > 0 ? '+' : ''}${bucket.netSentiment.toFixed(0)}`}
                  className={`h-8 w-4 rounded-sm ${bucket.netSentiment >= 20 ? 'bg-emerald-500/70' : bucket.netSentiment <= -20 ? 'bg-red-500/70' : 'bg-amber-500/50'}`}
                  style={{ opacity: 0.4 + Math.min(Math.abs(bucket.netSentiment) / 150, 0.6) }}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs italic text-muted-foreground/60">Keine Buckets</p>
          )}
        </div>
      </div>

      {/* Divergences */}
      {divergences.length > 0 && (
        <div className="mt-4 rounded-sm border border-primary/15 bg-background/40 p-4">
          <div className="mb-2.5 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-400" />
            <span className="text-[10px] font-headline uppercase tracking-[0.2em] text-muted-foreground">Sentiment-Divergenzen</span>
          </div>
          <div className="space-y-2">
            {divergences.slice(0, 4).map((divergence, index) => (
              <div key={index} className="flex items-baseline gap-2 text-xs">
                <span className="shrink-0 rounded-sm border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-headline text-[9px] uppercase tracking-wider text-amber-400">
                  {DIVERGENCE_LABELS[divergence.type ?? ''] ?? divergence.type}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground/60">
                  {divergence.timestamp ? new Date(divergence.timestamp).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : ''}
                </span>
                <span className="font-body text-muted-foreground">{divergence.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </WidgetFrame>
  )
}
