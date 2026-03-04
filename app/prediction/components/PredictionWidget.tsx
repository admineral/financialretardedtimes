'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Sparkles, TrendingUp, TrendingDown, Flame, ChartBar, Crosshair, ExternalLink, RefreshCw, Brain, Clock, Target, X } from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { Prediction } from './PredictionCard'

interface OHLCData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

interface TimelineEvent {
  id: string
  date: string
  time: string
  title: string
  fullQuote: string
  description: string
  type: 'discussion' | 'prediction' | 'drama' | 'insight' | 'milestone' | 'humor'
  participants: string[]
  priceContext?: string
  sentiment?: string
  priceAtQuote?: number
  hasTimeframe?: boolean
}

const ChartJSCandlestick = dynamic(
  () => import('../../chart-timeline/components/ChartJSCandlestick').then((mod) => mod.ChartJSCandlestick),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

function ChartSkeleton() {
  return (
    <div className="w-full h-full bg-muted/20 rounded-lg animate-pulse flex items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
        <span className="text-muted-foreground text-xs">Chart lädt...</span>
      </div>
    </div>
  )
}

function CompactCardSkeleton() {
  return (
    <div className="rounded-lg border border-primary/10 bg-card/40 animate-pulse p-3">
      <div className="flex gap-2 mb-2">
        <div className="w-16 h-3 bg-muted rounded" />
        <div className="w-10 h-3 bg-muted rounded" />
      </div>
      <div className="w-full h-3 bg-muted rounded mb-1" />
      <div className="w-4/5 h-3 bg-muted rounded" />
    </div>
  )
}

const timeframeConfig = {
  short: { icon: Flame, label: 'Kurz', color: 'text-orange-400', border: 'border-orange-500/20', bg: 'bg-orange-500/5' },
  mid:   { icon: ChartBar, label: 'Mittel', color: 'text-blue-400', border: 'border-blue-500/20', bg: 'bg-blue-500/5' },
  long:  { icon: Crosshair, label: 'Lang', color: 'text-purple-400', border: 'border-purple-500/20', bg: 'bg-purple-500/5' },
}

function getDirectionStyle(direction: string) {
  switch (direction) {
    case 'bullish': case 'pump_call':
      return { bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', text: 'text-emerald-400', label: '📈 Bullish' }
    case 'bearish': case 'dump_call':
      return { bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'text-red-400', label: '📉 Bearish' }
    default:
      return { bg: 'bg-zinc-500/20', border: 'border-zinc-500/50', text: 'text-zinc-400', label: '➡️ Neutral' }
  }
}

// ── Modal (identical to /prediction page) ─────────────────────────────
function PredictionModal({ prediction, onClose }: { prediction: Prediction; onClose: () => void }) {
  const style = getDirectionStyle(prediction.direction)
  const tf = timeframeConfig[prediction.timeframe]
  const TfIcon = tf.icon

  const confidenceLabels: Record<string, string> = { low: 'Unsicher', medium: 'Normal', high: 'Sehr sicher' }

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`relative max-w-lg w-full rounded-xl border-2 ${style.border} ${style.bg} bg-zinc-950 shadow-2xl overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-5 py-4 border-b ${style.border} flex items-center justify-between`}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-sm font-bold uppercase tracking-wider ${style.text}`}>{style.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${tf.bg} ${tf.color} border ${tf.border}`}>
              <TfIcon className="w-3 h-3" />{tf.label}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded ${
              prediction.confidence === 'high' ? 'bg-amber-500/20 text-amber-400' :
              prediction.confidence === 'low' ? 'bg-zinc-700 text-zinc-400' : 'bg-zinc-800 text-zinc-300'
            }`}>
              {confidenceLabels[prediction.confidence]}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 transition-colors">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <h3 className="text-xl font-bold leading-snug">„{prediction.prediction}"</h3>

          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <p className="text-sm italic leading-relaxed text-zinc-400">„{prediction.originalText}"</p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {prediction.targetPrice && (
              <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                <div className="text-xs text-zinc-500 mb-1 flex items-center gap-1">
                  <Target className="w-3 h-3" /> Zielpreis
                </div>
                <div className={`font-mono font-bold text-lg ${style.text}`}>
                  ${prediction.targetPrice.toLocaleString()}
                </div>
              </div>
            )}
            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
              <div className="text-xs text-zinc-500 mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Deadline
              </div>
              <div className="font-medium text-zinc-200">{prediction.targetDateText}</div>
              {prediction.targetDate && (
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  {new Date(prediction.targetDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-white/10 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium text-zinc-200">@{prediction.username}</span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-500">
                {new Date(prediction.timestamp).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                {' '}
                {new Date(prediction.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            {prediction.priceAtPrediction > 0 && (
              <span className={`font-mono font-bold ${style.text}`}>
                ${prediction.priceAtPrediction.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Compact card — now clickable to open modal ─────────────────────────
function CompactPredictionCard({ prediction, onClick }: { prediction: Prediction; onClick: () => void }) {
  const tf = timeframeConfig[prediction.timeframe]
  const TfIcon = tf.icon
  const isBull = prediction.direction === 'bullish'
  const isBear = prediction.direction === 'bearish'
  const dirColor = isBull ? 'text-emerald-400' : isBear ? 'text-red-400' : 'text-amber-400'
  const DirIcon = isBull ? TrendingUp : isBear ? TrendingDown : null

  return (
    <button
      onClick={onClick}
      className={`text-left w-full block rounded-lg border ${tf.border} ${tf.bg} p-3 hover:brightness-125 hover:scale-[1.02] transition-all`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`flex items-center gap-1 text-[10px] font-semibold ${tf.color}`}>
            <TfIcon className="w-3 h-3" />{tf.label}
          </span>
          <span className="text-[10px] text-muted-foreground">@{prediction.username}</span>
        </div>
        {DirIcon && <DirIcon className={`w-3.5 h-3.5 flex-shrink-0 ${dirColor}`} />}
      </div>

      <p className="text-xs text-foreground/80 leading-snug line-clamp-2 mb-2">
        {prediction.emoji && <span className="mr-1">{prediction.emoji}</span>}
        {prediction.prediction}
      </p>

      <div className="flex items-center justify-between gap-2">
        {prediction.targetPrice ? (
          <span className={`flex items-center gap-1 text-[10px] font-mono font-semibold ${dirColor}`}>
            <Target className="w-3 h-3" />${prediction.targetPrice.toLocaleString()}
          </span>
        ) : <span />}
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
          <Clock className="w-3 h-3" />{prediction.targetDateText}
        </span>
      </div>
    </button>
  )
}

function StatBadge({ icon: Icon, count, color }: { icon: React.ElementType; count: number; color: string }) {
  return (
    <span className={`flex items-center gap-1 text-xs font-mono ${color}`}>
      <Icon className="w-3 h-3" />
      {count}
    </span>
  )
}

export function PredictionWidget() {
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [summary, setSummary] = useState('')
  const [ohlcData, setOhlcData] = useState<OHLCData[]>([])
  const [currentPrice, setCurrentPrice] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [modalPrediction, setModalPrediction] = useState<Prediction | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [predRes, ohlcRes] = await Promise.all([
        fetch('/prediction/api/extract'),
        fetch('/chart-timeline/api/ohlc?timeframe=1H'),
      ])

      let validPredictions: Prediction[] = []

      if (predRes.ok) {
        const data = await predRes.json()
        if (data.predictions?.length > 0) {
          validPredictions = data.predictions.filter(
            (p: Prediction) => p && typeof p.id === 'string' && typeof p.username === 'string'
          )
          setPredictions(validPredictions)
          setSummary(data.summary ?? '')
          setFetchedAt(data.fetchedAt ?? null)
        }
      }

      if (ohlcRes.ok) {
        const data = await ohlcRes.json()
        if (data.ohlc?.length > 0) {
          // Clip OHLC to start from the earliest prediction timestamp so we
          // don't show empty candles before any predictions exist
          const earliestPredTs = validPredictions.length > 0
            ? Math.min(...validPredictions.map((p) => new Date(p.timestamp).getTime()))
            : 0
          const clipped = earliestPredTs > 0
            ? data.ohlc.filter((c: OHLCData) => c.timestamp >= earliestPredTs)
            : data.ohlc
          const ohlc = clipped.length > 0 ? clipped : data.ohlc
          setOhlcData(ohlc)
          setCurrentPrice(ohlc[ohlc.length - 1].close)
        }
      }
    } catch { /* ignore */ }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const grouped = useMemo(() => ({
    short: predictions.filter((p) => p.timeframe === 'short'),
    mid: predictions.filter((p) => p.timeframe === 'mid'),
    long: predictions.filter((p) => p.timeframe === 'long'),
  }), [predictions])

  const chartEvents = useMemo<TimelineEvent[]>(() => {
    if (ohlcData.length === 0 || predictions.length === 0) return []
    const chartStart = ohlcData[0]?.timestamp || 0
    const chartEnd = ohlcData[ohlcData.length - 1]?.timestamp || Date.now()
    const chartRange = chartEnd - chartStart

    return predictions.slice(0, 20).map((p, idx) => {
      const t = new Date(p.timestamp).getTime()
      let mappedTs: string
      if (t >= chartStart && t <= chartEnd) {
        mappedTs = p.timestamp
      } else {
        const spread = chartStart + (chartRange / (predictions.length + 1)) * (idx + 1)
        mappedTs = new Date(spread).toISOString()
      }
      return {
        id: p.id,
        date: mappedTs.split('T')[0],
        time: mappedTs.split('T')[1]?.slice(0, 5) || '12:00',
        title: p.prediction.slice(0, 35) + (p.prediction.length > 35 ? '...' : ''),
        fullQuote: p.prediction,
        description: `@${p.username}`,
        type: 'prediction' as const,
        participants: [p.username],
        priceContext: p.direction === 'bullish' ? 'pump_call' : p.direction === 'bearish' ? 'dump_call' : 'analysis',
        sentiment: p.direction,
        priceAtQuote: p.priceAtPrediction,
        hasTimeframe: !!p.targetDate,
      }
    })
  }, [predictions, ohlcData])

  const handleChartEventClick = useCallback((event: TimelineEvent) => {
    const pred = predictions.find((p) => p.id === event.id)
    if (pred) setModalPrediction(pred)
  }, [predictions])

  const timeAgo = fetchedAt ? (() => {
    const diffMs = Date.now() - new Date(fetchedAt).getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    if (diffMins < 1) return 'gerade eben'
    if (diffMins < 60) return `vor ${diffMins}m`
    if (diffHours < 24) return `vor ${diffHours}h`
    return `vor ${Math.floor(diffHours / 24)}d`
  })() : null

  const previewCards: Prediction[] = useMemo(() => {
    const picks: Prediction[] = []
    if (grouped.short[0]) picks.push(grouped.short[0])
    if (grouped.mid[0]) picks.push(grouped.mid[0])
    if (grouped.long[0]) picks.push(grouped.long[0])
    return picks
  }, [grouped])

  return (
    <section className="border-t border-primary/10 bg-card/20 relative z-10">
      <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-400" />
              <h2 className="font-headline text-lg uppercase tracking-wider text-foreground">
                Prediction Market
              </h2>
            </div>
            <div className="flex-1 h-px w-16 bg-gradient-to-r from-purple-400/40 to-transparent" />
            {predictions.length > 0 && (
              <div className="flex items-center gap-3">
                <StatBadge icon={Flame} count={grouped.short.length} color="text-orange-400" />
                <StatBadge icon={ChartBar} count={grouped.mid.length} color="text-blue-400" />
                <StatBadge icon={Crosshair} count={grouped.long.length} color="text-purple-400" />
              </div>
            )}
            {isLoading && <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />}
          </div>

          <div className="flex items-center gap-3">
            {timeAgo && (
              <span className="text-xs text-muted-foreground/60 font-mono hidden sm:block">
                <Sparkles className="w-3 h-3 inline mr-1 text-purple-400" />
                {timeAgo}
              </span>
            )}
            <Link
              href="/prediction"
              className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-500 transition-colors border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 rounded px-2 py-1"
            >
              <ExternalLink className="w-3 h-3" />
              <span className="hidden sm:inline">Vollbild</span>
            </Link>
          </div>
        </div>

        {/* AI Summary */}
        {summary && (
          <div className="mb-4 p-3 rounded-lg bg-purple-900/20 border border-purple-800/30 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-purple-200 leading-relaxed line-clamp-2">{summary}</p>
          </div>
        )}

        {/* Chart — full width, labels clickable */}
        <div className="border border-primary/10 rounded-lg overflow-hidden mb-4" style={{ height: 420 }}>
          {isLoading ? (
            <ChartSkeleton />
          ) : ohlcData.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
              Keine Chart-Daten
            </div>
          ) : (
            <ChartJSCandlestick
              ohlcData={ohlcData}
              events={chartEvents}
              timeframe="1H"
              disableZoom
              minLineLength={80}
              onEventClick={handleChartEventClick}
            />
          )}
        </div>

        {/* Direction bar */}
        {predictions.length > 0 && (() => {
          const bull = predictions.filter((p) => p.direction === 'bullish').length
          const bear = predictions.filter((p) => p.direction === 'bearish').length
          const total = predictions.length
          const bullPct = Math.round((bull / total) * 100)
          const bearPct = Math.round((bear / total) * 100)
          return (
            <div className="mb-4 px-3 py-2 border border-primary/10 rounded-lg bg-card/30 flex items-center gap-4">
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 whitespace-nowrap">
                <TrendingUp className="w-3 h-3" /> {bullPct}%
              </span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden flex">
                <div className="bg-emerald-500 transition-all duration-700" style={{ width: `${bullPct}%` }} />
                <div className="bg-red-500 transition-all duration-700" style={{ width: `${bearPct}%` }} />
              </div>
              <span className="flex items-center gap-1 text-[10px] text-red-400 whitespace-nowrap">
                {bearPct}% <TrendingDown className="w-3 h-3" />
              </span>
              <span className="text-[10px] text-muted-foreground/50 pl-2 border-l border-primary/10">{total} Vorhersagen</span>
            </div>
          )
        })()}

        {/* Compact Prediction Cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => <CompactCardSkeleton key={i} />)}
          </div>
        ) : previewCards.length === 0 ? (
          <div className="border border-primary/10 rounded-lg flex items-center justify-center gap-3 p-5">
            <Brain className="w-6 h-6 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">Noch keine Vorhersagen</p>
            <Link
              href="/prediction"
              className="text-xs px-3 py-1.5 bg-purple-600/20 text-purple-400 rounded border border-purple-600/30 hover:bg-purple-600/30 transition-colors"
            >
              Generieren
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {previewCards.map((p) => (
              <CompactPredictionCard key={p.id} prediction={p} onClick={() => setModalPrediction(p)} />
            ))}
            {predictions.length > 3 && (
              <Link
                href="/prediction"
                className="flex items-center justify-center text-xs text-purple-400 hover:text-purple-300 transition-colors border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 rounded-lg py-3 gap-2"
              >
                <ExternalLink className="w-3 h-3" />
                + {predictions.length - 3} weitere
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalPrediction && (
        <PredictionModal
          prediction={modalPrediction}
          onClose={() => setModalPrediction(null)}
        />
      )}
    </section>
  )
}
