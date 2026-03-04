'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ThemeSwitcher } from '@/components/theme-switcher'
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Database,
  Brain,
  BarChart2,
  AlertTriangle,
  Smile,
  Frown,
  Meh,
} from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { z } from 'zod'
import type { SentimentBucket, SentimentDivergence } from './components/SentimentLineChart'

// Schema must match API (for useObject)
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

const SentimentLineChart = dynamic(
  () => import('./components/SentimentLineChart').then((mod) => mod.SentimentLineChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

interface OHLCData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

function ChartSkeleton() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-zinc-900/50 rounded-lg animate-pulse">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
        <span className="text-zinc-500 text-sm">Sentiment-Chart lädt...</span>
      </div>
    </div>
  )
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Nie'
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  if (diffMins < 1) return 'Gerade eben'
  if (diffMins < 60) return `vor ${diffMins} Min.`
  if (diffHours < 24) return `vor ${diffHours} Std.`
  return `vor ${Math.floor(diffHours / 24)} Tag${diffHours >= 48 ? 'en' : ''}`
}

function SentimentGauge({ value }: { value: number }) {
  const clamped = Math.max(-100, Math.min(100, value))
  const pct = ((clamped + 100) / 200) * 100
  const color =
    clamped >= 60 ? '#10b981' : clamped >= 20 ? '#22c55e' : clamped >= -20 ? '#eab308' : clamped >= -60 ? '#f97316' : '#dc2626'
  const label =
    clamped >= 60 ? 'Extreme Gier' : clamped >= 20 ? 'Gier' : clamped >= -20 ? 'Neutral' : clamped >= -60 ? 'Angst' : 'Extreme Angst'

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-32 h-16 overflow-hidden">
        <div className="absolute inset-0 rounded-t-full border-4 border-zinc-800" />
        <div
          className="absolute bottom-0 left-1/2 w-1 h-16 origin-bottom"
          style={{ transform: `translateX(-50%) rotate(${(pct / 100) * 180 - 90}deg)`, backgroundColor: color, transition: 'transform 0.8s ease-out' }}
        />
        <div className="absolute bottom-0 left-1/2 w-3 h-3 rounded-full -translate-x-1/2 border-2 border-zinc-900" style={{ backgroundColor: color }} />
      </div>
      <div className="text-2xl font-bold font-mono" style={{ color }}>
        {clamped > 0 ? '+' : ''}{clamped.toFixed(0)}
      </div>
      <div className="text-xs text-zinc-400">{label}</div>
    </div>
  )
}

function BucketDetailCard({ bucket, onClose }: { bucket: SentimentBucket; onClose: () => void }) {
  const net = bucket.netSentiment
  const color = net >= 20 ? 'text-emerald-400' : net <= -20 ? 'text-red-400' : 'text-amber-400'
  const bg = net >= 20 ? 'bg-emerald-500/10 border-emerald-500/30' : net <= -20 ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'

  return (
    <div className={`p-4 rounded-lg border ${bg} space-y-3`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">
          {new Date(bucket.timestamp).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xs">✕ Schließen</button>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-center">
          <div className={`text-3xl font-bold font-mono ${color}`}>{net > 0 ? '+' : ''}{net.toFixed(0)}</div>
          <div className="text-[10px] text-zinc-500">Net Sentiment</div>
        </div>
        <div className="space-y-1 text-sm flex-1">
          <div className="flex justify-between"><span className="text-emerald-400">📈 Bullisch</span><span className="font-mono">{bucket.bullishScore}/100</span></div>
          <div className="flex justify-between"><span className="text-red-400">📉 Bärisch</span><span className="font-mono">{bucket.bearishScore}/100</span></div>
          <div className="flex justify-between"><span className="text-zinc-400">💬 Nachrichten</span><span className="font-mono">{bucket.messageCount}</span></div>
          {bucket.priceAtBucket && (
            <div className="flex justify-between"><span className="text-amber-400">₿ BTC</span><span className="font-mono">${bucket.priceAtBucket.toLocaleString()}</span></div>
          )}
        </div>
      </div>
      {bucket.dominantKeywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {bucket.dominantKeywords.map((kw) => (
            <span key={kw} className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-[11px]">{kw}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// Streaming progress indicator
function StreamingIndicator({ bucketCount }: { bucketCount: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-violet-400">
      <div className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1 h-1 rounded-full bg-violet-400 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <span>KI analysiert... {bucketCount > 0 ? `${bucketCount} Buckets` : ''}</span>
    </div>
  )
}

export default function SentimentPage() {
  const [ohlcData, setOhlcData] = useState<OHLCData[]>([])
  const [cachedData, setCachedData] = useState<z.infer<typeof SentimentResponseSchema> | null>(null)
  const [lastStreamData, setLastStreamData] = useState<z.infer<typeof SentimentResponseSchema> | null>(null)
  const [isCached, setIsCached] = useState(false)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [showPrice, setShowPrice] = useState(true)
  const [selectedBucket, setSelectedBucket] = useState<SentimentBucket | null>(null)

  // Streaming AI hook
  const { object: streamingData, isLoading: isAnalyzing, submit: runAnalysis } = useObject({
    api: '/chart-timeline/sentiment/api/sentiment',
    schema: SentimentResponseSchema,
  })

  // Persist streaming data after it completes
  useEffect(() => {
    if (streamingData?.buckets && streamingData.buckets.length > 0) {
      setLastStreamData(streamingData as z.infer<typeof SentimentResponseSchema>)
    }
  }, [streamingData])

  // Active data: prefer live stream, then last stream, then cache
  const activeData = streamingData ?? lastStreamData ?? cachedData

  // Safe buckets - only fully formed ones
  const validBuckets = useMemo<SentimentBucket[]>(() => {
    if (!activeData?.buckets) return []
    return activeData.buckets.filter((b): b is SentimentBucket =>
      b !== undefined &&
      typeof b.timestamp === 'string' &&
      typeof b.netSentiment === 'number' &&
      typeof b.bullishScore === 'number' &&
      typeof b.bearishScore === 'number'
    )
  }, [activeData])

  // Fetch OHLC
  const fetchOHLC = useCallback(async () => {
    try {
      const res = await fetch('/chart-timeline/api/ohlc?timeframe=1H')
      if (!res.ok) return
      const data = await res.json()
      setOhlcData(data.ohlc || [])
    } catch { /* ignore */ }
  }, [])

  // Load cached analysis on mount
  const loadCache = useCallback(async () => {
    setIsInitialLoading(true)
    try {
      const res = await fetch('/chart-timeline/sentiment/api/sentiment')
      if (!res.ok) return
      const data = await res.json()
      if (data.cached && data.buckets?.length > 0) {
        setCachedData(data)
        setIsCached(true)
        setFetchedAt(data.fetchedAt)
      }
    } catch { /* ignore */ }
    finally {
      setIsInitialLoading(false)
    }
  }, [])

  useEffect(() => {
    Promise.all([loadCache(), fetchOHLC()])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Track fetchedAt when streaming completes
  useEffect(() => {
    if (!isAnalyzing && lastStreamData) {
      setFetchedAt(new Date().toISOString())
      setIsCached(false)
    }
  }, [isAnalyzing, lastStreamData])

  const handleRefresh = () => {
    setLastStreamData(null)
    setFetchedAt(null)
    runAnalysis({})
  }

  const overall = activeData?.overallSentiment
  const divergences = activeData?.sentimentDivergences ?? []

  const trendIcon =
    overall?.trend === 'bullish' ? <TrendingUp className="w-5 h-5 text-emerald-500" /> :
    overall?.trend === 'bearish' ? <TrendingDown className="w-5 h-5 text-red-500" /> :
    <Minus className="w-5 h-5 text-amber-500" />

  const isLoading = isInitialLoading
  const showChart = validBuckets.length > 0

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="fixed inset-0 bg-gradient-to-br from-violet-900/5 via-zinc-950 to-zinc-950 pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-800">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
                <BarChart2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                  BTC Sentiment Chart
                </h1>
                <p className="text-[10px] text-zinc-500">Community-Stimmung über Zeit</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/chart-timeline" className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-colors">
                <TrendingUp className="w-3.5 h-3.5" />Candlestick
              </Link>
              <Link href="/prediction" className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/20 transition-colors">
                <Brain className="w-3.5 h-3.5" />Prediction
              </Link>
              <ThemeSwitcher />
            </div>
          </div>
        </header>

        {/* Controls Bar */}
        <div className="border-b border-zinc-800 bg-zinc-900/50">
          <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-xs text-zinc-400">
              {isCached && (
                <span className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">
                  <Database className="w-3 h-3" />Cached
                </span>
              )}
              {fetchedAt && (
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-violet-400" />
                  {formatRelativeTime(fetchedAt)}
                </span>
              )}
              {activeData?.timeRange && (
                <span className="hidden sm:flex items-center gap-1 text-zinc-500">
                  📊 {activeData.timeRange.totalMessages?.toLocaleString()} Nachrichten
                </span>
              )}
              {isAnalyzing && <StreamingIndicator bucketCount={validBuckets.length} />}
              <button
                onClick={() => setShowPrice((v) => !v)}
                className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
                  showPrice ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'text-zinc-500 border-zinc-700 hover:text-zinc-300'
                }`}
              >
                ₿ Preis-Overlay
              </button>
            </div>

            <button
              onClick={handleRefresh}
              disabled={isAnalyzing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-violet-600/20 text-violet-400 border border-violet-600/30 hover:bg-violet-600/30 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isAnalyzing ? 'animate-spin' : ''}`} />
              {isAnalyzing ? 'Analysiere...' : 'Neu analysieren'}
            </button>
          </div>
        </div>

        {/* Main */}
        <div className="max-w-7xl mx-auto px-4 py-5 space-y-5">

          {/* Overall Sentiment + Stats - show as soon as we have overall data */}
          {overall && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 flex flex-col items-center justify-center gap-3">
                <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Aktuelles Sentiment</h2>
                {overall.avgNetSentiment !== undefined ? (
                  <>
                    <SentimentGauge value={overall.avgNetSentiment} />
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      {trendIcon}
                      <span className={overall.trend === 'bullish' ? 'text-emerald-400' : overall.trend === 'bearish' ? 'text-red-400' : 'text-amber-400'}>
                        {overall.trend === 'bullish' ? 'Bullisch' : overall.trend === 'bearish' ? 'Bärisch' : 'Neutral'}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                )}
              </div>

              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-4">
                <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Extrempunkte</h2>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                      <Smile className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-xs text-zinc-400">Peak Bullisch</div>
                      {overall.peakBullish?.timestamp ? (
                        <>
                          <div className="text-emerald-400 font-mono font-bold">+{overall.peakBullish.score?.toFixed(0)}</div>
                          <div className="text-[10px] text-zinc-500">
                            {new Date(overall.peakBullish.timestamp).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </>
                      ) : <div className="h-3 w-16 bg-zinc-800 animate-pulse rounded mt-1" />}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                      <Frown className="w-4 h-4 text-red-400" />
                    </div>
                    <div>
                      <div className="text-xs text-zinc-400">Peak Bärisch</div>
                      {overall.peakBearish?.timestamp ? (
                        <>
                          <div className="text-red-400 font-mono font-bold">{overall.peakBearish.score?.toFixed(0)}</div>
                          <div className="text-[10px] text-zinc-500">
                            {new Date(overall.peakBearish.timestamp).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </>
                      ) : <div className="h-3 w-16 bg-zinc-800 animate-pulse rounded mt-1" />}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 flex flex-col gap-2">
                <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />AI Zusammenfassung
                </h2>
                {overall.summary ? (
                  <p className="text-sm text-zinc-300 leading-relaxed">{overall.summary}</p>
                ) : (
                  <div className="space-y-2 animate-pulse">
                    <div className="h-3 bg-zinc-800 rounded w-full" />
                    <div className="h-3 bg-zinc-800 rounded w-4/5" />
                    <div className="h-3 bg-zinc-800 rounded w-3/5" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Main Chart */}
          <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/30">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-zinc-200">Sentiment über Zeit</h2>
                <div className="hidden sm:flex items-center gap-3 text-[10px] text-zinc-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500 inline-block" />Bullisch</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-500 inline-block" />Bärisch</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-1 bg-indigo-400 inline-block rounded" />Net</span>
                  {showPrice && <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-400 inline-block" />BTC Preis</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isAnalyzing && validBuckets.length > 0 && (
                  <span className="text-[10px] text-violet-400 animate-pulse">
                    {validBuckets.length} Buckets ↓
                  </span>
                )}
                {validBuckets.length > 0 && (
                  <span className="text-[10px] text-zinc-500">
                    {validBuckets.length} Zeitfenster • 4h Buckets
                  </span>
                )}
              </div>
            </div>

            <div style={{ height: 420 }}>
              {isLoading ? (
                <ChartSkeleton />
              ) : !showChart && !isAnalyzing ? (
                <div className="h-full flex flex-col items-center justify-center gap-3">
                  <Meh className="w-8 h-8 text-zinc-600" />
                  <p className="text-sm text-zinc-500">Noch keine Analyse vorhanden</p>
                  <button
                    onClick={handleRefresh}
                    className="text-xs px-3 py-1.5 bg-violet-600/20 text-violet-400 rounded border border-violet-600/30 hover:bg-violet-600/30"
                  >
                    Analyse starten
                  </button>
                </div>
              ) : !showChart && isAnalyzing ? (
                <div className="h-full flex flex-col items-center justify-center gap-4">
                  <div className="w-10 h-10 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
                  <div className="text-center">
                    <p className="text-sm text-zinc-400">KI analysiert Sentiment-Daten...</p>
                    <p className="text-xs text-zinc-600 mt-1">Chart erscheint sobald erste Buckets fertig sind</p>
                  </div>
                </div>
              ) : (
                <SentimentLineChart
                  buckets={validBuckets}
                  divergences={divergences.filter((d): d is SentimentDivergence =>
                    d !== undefined && typeof d.timestamp === 'string' && typeof d.type === 'string'
                  )}
                  ohlcData={ohlcData}
                  showPrice={showPrice}
                  onBucketClick={setSelectedBucket}
                />
              )}
            </div>
          </div>

          {/* Selected Bucket Detail */}
          {selectedBucket && (
            <BucketDetailCard bucket={selectedBucket} onClose={() => setSelectedBucket(null)} />
          )}

          {/* Divergences */}
          {divergences.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Sentiment-Divergenzen
                <span className="text-xs font-normal text-zinc-500">Preis vs. Community-Stimmung</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {divergences.filter((d): d is SentimentDivergence => d !== undefined && typeof d.timestamp === 'string').map((div, i) => {
                  const typeConfig: Record<string, { color: string; label: string; icon: string }> = {
                    price_up_sentiment_down: { color: 'border-orange-500/40 bg-orange-500/5', label: 'Preis ↑ Stimmung ↓', icon: '⚠️' },
                    price_down_sentiment_up: { color: 'border-purple-500/40 bg-purple-500/5', label: 'Preis ↓ Stimmung ↑', icon: '🔄' },
                    capitulation: { color: 'border-red-500/40 bg-red-500/5', label: 'Kapitulation', icon: '🩸' },
                    euphoria: { color: 'border-emerald-500/40 bg-emerald-500/5', label: 'Euphorie', icon: '🎉' },
                  }
                  const cfg = typeConfig[div.type] || { color: 'border-zinc-700 bg-zinc-900', label: div.type, icon: '•' }
                  return (
                    <div key={i} className={`p-3 rounded-lg border ${cfg.color} space-y-1.5`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-300">{cfg.icon} {cfg.label}</span>
                        {div.priceChange !== undefined && (
                          <span className={`text-xs font-mono ${div.priceChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {div.priceChange >= 0 ? '+' : ''}{div.priceChange.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed">{div.description}</p>
                      <p className="text-[10px] text-zinc-600">
                        {new Date(div.timestamp).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Bucket Timeline Bar */}
          {validBuckets.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-violet-400" />
                Sentiment-Verlauf
                <span className="text-xs font-normal text-zinc-500">Klick für Details</span>
                {isAnalyzing && (
                  <span className="text-xs text-violet-400 animate-pulse">• lädt</span>
                )}
              </h2>
              <div className="overflow-x-auto">
                <div className="flex gap-1 min-w-max pb-1">
                  {validBuckets.map((b, i) => {
                    const net = b.netSentiment
                    const isBull = net >= 0
                    const isSelected = selectedBucket?.timestamp === b.timestamp
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedBucket(isSelected ? null : b)}
                        className="flex flex-col items-center gap-0.5 group relative"
                        title={`${new Date(b.timestamp).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit' })} — Net: ${net.toFixed(0)}`}
                      >
                        <div className="h-16 w-4 flex items-end justify-center">
                          <div
                            className={`w-3 rounded-sm transition-all ${isBull ? 'bg-emerald-500' : 'bg-red-500'} ${isSelected ? 'opacity-100 ring-1 ring-white' : 'opacity-60 group-hover:opacity-100'}`}
                            style={{ height: `${Math.max(2, Math.abs(net))}%` }}
                          />
                        </div>
                        <div className="text-[8px] text-zinc-600 rotate-45 origin-left w-8 overflow-hidden whitespace-nowrap">
                          {new Date(b.timestamp).toLocaleString('de-DE', { day: '2-digit', month: '2-digit' })}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="border-t border-zinc-800 py-4 mt-8">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <p className="text-[10px] text-zinc-600">
              Financial Retarded Times • AI Sentiment Analysis • BTC TradingView Chat
            </p>
          </div>
        </footer>
      </div>
    </main>
  )
}
