'use client'

import { useState, useEffect, useCallback } from 'react'
import { BarChart2, TrendingUp, TrendingDown, Minus, ExternalLink, RefreshCw, Sparkles } from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const SentimentCandlestickChart = dynamic(
  () => import('../sentiment/components/SentimentCandlestickChart').then((mod) => mod.SentimentCandlestickChart),
  { ssr: false, loading: () => <MiniChartSkeleton /> }
)

interface SentimentBucket {
  timestamp: string
  bullishScore: number
  bearishScore: number
  netSentiment: number
  messageCount: number
  fearGreed: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed'
  dominantKeywords: string[]
  priceAtBucket?: number
}

interface OverallSentiment {
  avgNetSentiment: number
  trend: 'bullish' | 'bearish' | 'neutral'
  summary: string
}

interface OHLCData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

function MiniChartSkeleton() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-muted/20 rounded animate-pulse">
      <div className="w-6 h-6 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
    </div>
  )
}

function SentimentBadge({ trend, avgNet }: { trend: string; avgNet: number }) {
  const isPositive = avgNet >= 0
  const color =
    avgNet >= 60 ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' :
    avgNet >= 20 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
    avgNet >= -20 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
    avgNet >= -60 ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' :
    'text-red-400 bg-red-500/10 border-red-500/20'

  const Icon = trend === 'bullish' ? TrendingUp : trend === 'bearish' ? TrendingDown : Minus

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-mono font-semibold ${color}`}>
      <Icon className="w-3.5 h-3.5" />
      <span>{isPositive ? '+' : ''}{avgNet.toFixed(0)}</span>
    </div>
  )
}

export function SentimentWidget() {
  const [buckets, setBuckets] = useState<SentimentBucket[]>([])
  const [overall, setOverall] = useState<OverallSentiment | null>(null)
  const [ohlcData, setOhlcData] = useState<OHLCData[]>([])
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [sentimentRes, ohlcRes] = await Promise.all([
        fetch('/chart-timeline/sentiment/api/sentiment'),
        fetch('/chart-timeline/api/ohlc?timeframe=1H'),
      ])
      if (sentimentRes.ok) {
        const data = await sentimentRes.json()
        if (data.cached && data.buckets?.length > 0) {
          const validBuckets = data.buckets.filter((b: SentimentBucket) =>
            b && typeof b.timestamp === 'string' && typeof b.netSentiment === 'number'
          )
          setBuckets(validBuckets)
          if (data.overallSentiment) setOverall(data.overallSentiment)
          if (data.fetchedAt) setFetchedAt(data.fetchedAt)

          if (ohlcRes.ok) {
            const ohlc = await ohlcRes.json()
            if (ohlc.ohlc?.length > 0) {
              // Clip OHLC to start from the earliest sentiment bucket
              const earliestBucket = validBuckets.length > 0
                ? new Date(validBuckets[0].timestamp).getTime()
                : 0
              const clipped = ohlc.ohlc.filter((c: OHLCData) => c.timestamp >= earliestBucket)
              setOhlcData(clipped.length > 0 ? clipped : ohlc.ohlc)
            }
          }
          return
        }
      }
      if (ohlcRes.ok) {
        const data = await ohlcRes.json()
        if (data.ohlc?.length > 0) setOhlcData(data.ohlc)
      }
    } catch { /* ignore */ }
    finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const timeAgo = fetchedAt ? (() => {
    const diffMs = Date.now() - new Date(fetchedAt).getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    if (diffMins < 1) return 'gerade eben'
    if (diffMins < 60) return `vor ${diffMins}m`
    if (diffHours < 24) return `vor ${diffHours}h`
    return `vor ${Math.floor(diffHours / 24)}d`
  })() : null

  const trendLabel =
    overall?.trend === 'bullish' ? 'Bullisch' :
    overall?.trend === 'bearish' ? 'Bärisch' : 'Neutral'

  return (
    <section className="border-t border-primary/10 bg-card/20 relative z-10">
      <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-violet-400" />
              <h2 className="font-headline text-lg uppercase tracking-wider text-foreground">
                BTC Sentiment
              </h2>
            </div>
            <div className="flex-1 h-px w-16 bg-gradient-to-r from-violet-400/40 to-transparent" />
            {overall && (
              <SentimentBadge trend={overall.trend} avgNet={overall.avgNetSentiment} />
            )}
            {isLoading && (
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
            )}
          </div>

          <div className="flex items-center gap-3">
            {timeAgo && (
              <span className="text-xs text-muted-foreground/60 font-mono hidden sm:block">
                <Sparkles className="w-3 h-3 inline mr-1 text-violet-400" />
                {timeAgo}
              </span>
            )}
            <Link
              href="/chart-timeline/sentiment"
              className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-500 transition-colors border border-violet-500/20 bg-violet-500/10 hover:bg-violet-500/20 rounded px-2 py-1"
            >
              <ExternalLink className="w-3 h-3" />
              <span className="hidden sm:inline">Vollbild</span>
            </Link>
          </div>
        </div>

        {/* Chart — full width */}
        <div className="border border-primary/10 rounded-lg overflow-hidden bg-zinc-950/60 mb-4" style={{ height: 300 }}>
          {isLoading ? (
            <MiniChartSkeleton />
          ) : buckets.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <BarChart2 className="w-7 h-7 opacity-30" />
              <p className="text-xs">Noch keine Sentiment-Daten</p>
              <Link
                href="/chart-timeline/sentiment"
                className="text-xs px-3 py-1.5 bg-violet-600/20 text-violet-400 rounded border border-violet-600/30 hover:bg-violet-600/30 transition-colors"
              >
                Analyse starten
              </Link>
            </div>
          ) : (
            <SentimentCandlestickChart buckets={buckets} ohlcData={ohlcData} />
          )}
        </div>

        {/* Stats row below chart */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* 7-Tage Sentiment score */}
          <div className="border border-primary/10 rounded-lg p-4 bg-card/40 flex flex-col items-center justify-center gap-1">
            {isLoading ? (
              <div className="w-7 h-7 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
            ) : overall ? (
              <>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">7-Tage Sentiment</span>
                <span className={`text-3xl font-bold font-mono ${
                  overall.avgNetSentiment >= 20 ? 'text-emerald-400' :
                  overall.avgNetSentiment <= -20 ? 'text-red-400' : 'text-amber-400'
                }`}>
                  {overall.avgNetSentiment >= 0 ? '+' : ''}{overall.avgNetSentiment.toFixed(0)}
                </span>
                <span className="text-xs text-muted-foreground">{trendLabel}</span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Keine Daten</span>
            )}
          </div>

          {/* AI Summary */}
          <div className="border border-primary/10 rounded-lg p-3 bg-card/40">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3 h-3 text-violet-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">AI Summary</span>
            </div>
            {isLoading ? (
              <div className="space-y-1.5 animate-pulse">
                <div className="h-2.5 bg-muted rounded w-full" />
                <div className="h-2.5 bg-muted rounded w-4/5" />
                <div className="h-2.5 bg-muted rounded w-3/5" />
              </div>
            ) : overall?.summary ? (
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{overall.summary}</p>
            ) : (
              <p className="text-xs text-muted-foreground/50 italic">Keine Zusammenfassung</p>
            )}
          </div>

          {/* Recent buckets */}
          <div className="border border-primary/10 rounded-lg p-3 bg-card/40">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-2">Letzte Buckets</span>
            {isLoading ? (
              <div className="flex gap-0.5">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="w-4 h-8 rounded-sm bg-muted animate-pulse" />
                ))}
              </div>
            ) : buckets.length > 0 ? (
              <div className="flex gap-0.5 flex-wrap">
                {buckets.slice(-12).map((b, i) => {
                  const net = b.netSentiment
                  return (
                    <div
                      key={i}
                      title={`${new Date(b.timestamp).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit' })} — ${net > 0 ? '+' : ''}${net.toFixed(0)}`}
                      className={`w-4 h-8 rounded-sm ${net >= 20 ? 'bg-emerald-500/70' : net <= -20 ? 'bg-red-500/70' : 'bg-amber-500/50'}`}
                      style={{ opacity: 0.4 + Math.abs(net) / 150 }}
                    />
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50 italic">Keine Buckets</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
