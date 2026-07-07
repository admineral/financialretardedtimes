'use client'

/**
 * PredictionWidget — the full prediction market as a reusable,
 * newspaper-styled widget: predictions plotted on a matching BTC chart,
 * bull/bear ratio, grouped prediction cards with detail modal and a live
 * streaming regenerate (same endpoint as /prediction).
 */

import { experimental_useObject as useObject } from '@ai-sdk/react'
import { Brain, ChartBar, Clock, Crosshair, Flame, Sparkles, Target, TrendingDown, TrendingUp, X } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import {
  clipOhlcToWindow,
  fetchOhlc,
  isOlderThanHours,
  pickTimeframeForRange,
  type OHLCData,
  type OhlcTimeframe
} from './lib'
import { ChartSkeleton, WidgetEmptyState, WidgetFrame } from './WidgetFrame'

const ChartJSCandlestick = dynamic(
  () => import('@/app/chart-timeline/components/ChartJSCandlestick').then(mod => mod.ChartJSCandlestick),
  { ssr: false, loading: () => <ChartSkeleton height={420} /> }
)

// Must match /prediction/api/extract (server emits null for absent
// fields, old caches may omit them → nullish accepts both)
const PredictionSchema = z.object({
  id: z.string(),
  username: z.string(),
  avatar: z.string().nullish(),
  originalText: z.string(),
  prediction: z.string(),
  targetPrice: z.number().nullable(),
  direction: z.enum(['bullish', 'bearish', 'neutral']),
  timeframe: z.enum(['short', 'mid', 'long']),
  targetDate: z.string().nullable(),
  targetDateText: z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  priceAtPrediction: z.number(),
  timestamp: z.string(),
  emoji: z.string().nullish()
})

const ExtractResponseSchema = z.object({
  predictions: z.array(PredictionSchema),
  summary: z.string()
})

type Prediction = z.infer<typeof PredictionSchema>

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

const TIMEFRAME_CONFIG = {
  short: { icon: Flame, label: 'Kurzfristig', color: 'text-orange-400', border: 'border-orange-500/25', bg: 'bg-orange-500/5' },
  mid: { icon: ChartBar, label: 'Mittelfristig', color: 'text-blue-400', border: 'border-blue-500/25', bg: 'bg-blue-500/5' },
  long: { icon: Crosshair, label: 'Langfristig', color: 'text-purple-400', border: 'border-purple-500/25', bg: 'bg-purple-500/5' }
} as const

const CONFIDENCE_LABELS: Record<string, string> = { low: 'Unsicher', medium: 'Normal', high: 'Sehr sicher' }

function directionColor(direction: string): string {
  return direction === 'bullish' ? 'text-emerald-400' : direction === 'bearish' ? 'text-red-400' : 'text-amber-400'
}

function isCompletePrediction(value: unknown): value is Prediction {
  const p = value as Partial<Prediction> | undefined
  return Boolean(p && typeof p.id === 'string' && typeof p.username === 'string'
    && typeof p.prediction === 'string' && typeof p.timestamp === 'string'
    && typeof p.direction === 'string' && typeof p.timeframe === 'string')
}

function PredictionModal({ prediction, onClose }: { prediction: Prediction; onClose: () => void }) {
  const tf = TIMEFRAME_CONFIG[prediction.timeframe]
  const TfIcon = tf.icon
  const dirColor = directionColor(prediction.direction)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-card-gold relative w-full max-w-lg overflow-hidden rounded-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-primary/15 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-headline font-bold uppercase tracking-wider ${dirColor}`}>
              {prediction.direction === 'bullish' ? '📈 Bullish' : prediction.direction === 'bearish' ? '📉 Bearish' : '➡️ Neutral'}
            </span>
            <span className={`flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] ${tf.border} ${tf.bg} ${tf.color}`}>
              <TfIcon className="h-3 w-3" /> {tf.label}
            </span>
            <span className="rounded-sm border border-primary/20 bg-background/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {CONFIDENCE_LABELS[prediction.confidence]}
            </span>
          </div>
          <button onClick={onClose} className="rounded p-1 transition-colors hover:bg-foreground/10">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <h3 className="font-masthead text-xl leading-snug">&bdquo;{prediction.prediction}&ldquo;</h3>
          <blockquote className="rounded-sm border border-primary/15 bg-background/40 p-4">
            <p className="font-body text-sm italic leading-relaxed text-muted-foreground">&bdquo;{prediction.originalText}&ldquo;</p>
          </blockquote>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-sm border border-primary/15 bg-background/40 p-3">
              <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Target className="h-3 w-3" /> Zielpreis
              </div>
              <div className={`font-mono text-lg font-bold ${dirColor}`}>
                {prediction.targetPrice ? `$${prediction.targetPrice.toLocaleString('de-DE')}` : '—'}
              </div>
            </div>
            <div className="rounded-sm border border-primary/15 bg-background/40 p-3">
              <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3 w-3" /> Deadline
              </div>
              <div className="font-body text-sm font-medium">{prediction.targetDateText}</div>
              {prediction.targetDate && (
                <div className="mt-0.5 text-[10px] text-muted-foreground/60">
                  {new Date(prediction.targetDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-primary/10 pt-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-headline font-semibold text-primary">@{prediction.username}</span>
              <span className="text-muted-foreground/50">•</span>
              <span className="text-xs text-muted-foreground">
                {new Date(prediction.timestamp).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}
              </span>
            </div>
            {prediction.priceAtPrediction > 0 && (
              <span className={`font-mono font-bold ${dirColor}`}>${prediction.priceAtPrediction.toLocaleString('de-DE')}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PredictionCard({ prediction, onClick }: { prediction: Prediction; onClick: () => void }) {
  const tf = TIMEFRAME_CONFIG[prediction.timeframe]
  const TfIcon = tf.icon
  const dirColor = directionColor(prediction.direction)
  const DirIcon = prediction.direction === 'bullish' ? TrendingUp : prediction.direction === 'bearish' ? TrendingDown : null

  return (
    <button
      onClick={onClick}
      className={`block w-full rounded-sm border ${tf.border} ${tf.bg} p-3 text-left transition-all hover:scale-[1.01] hover:brightness-125`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className={`flex items-center gap-1 text-[10px] font-headline font-semibold uppercase tracking-wider ${tf.color}`}>
            <TfIcon className="h-3 w-3" /> {tf.label}
          </span>
          <span className="text-[10px] text-muted-foreground">@{prediction.username}</span>
        </div>
        {DirIcon && <DirIcon className={`h-3.5 w-3.5 flex-shrink-0 ${dirColor}`} />}
      </div>
      <p className="mb-2 line-clamp-2 font-body text-sm leading-snug text-foreground/85">
        {prediction.emoji && <span className="mr-1">{prediction.emoji}</span>}
        {prediction.prediction}
      </p>
      <div className="flex items-center justify-between gap-2">
        {prediction.targetPrice ? (
          <span className={`flex items-center gap-1 font-mono text-[10px] font-semibold ${dirColor}`}>
            <Target className="h-3 w-3" /> ${prediction.targetPrice.toLocaleString('de-DE')}
          </span>
        ) : <span />}
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
          <Clock className="h-3 w-3" /> {prediction.targetDateText}
        </span>
      </div>
    </button>
  )
}

export function PredictionWidget() {
  const [cached, setCached] = useState<{ predictions: Prediction[]; summary: string } | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [serverStale, setServerStale] = useState(false)
  const [ohlcData, setOhlcData] = useState<OHLCData[]>([])
  const [timeframe, setTimeframe] = useState<OhlcTimeframe>('1H')
  const [isLoading, setIsLoading] = useState(true)
  const [modalPrediction, setModalPrediction] = useState<Prediction | null>(null)
  const [showAll, setShowAll] = useState(false)

  const { object: streaming, isLoading: isGenerating, submit: runExtraction } = useObject({
    api: '/prediction/api/extract',
    schema: ExtractResponseSchema
  })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      let loaded: Prediction[] = []
      try {
        const res = await fetch('/prediction/api/extract')
        if (res.ok) {
          const json = await res.json()
          if (json.cached && Array.isArray(json.predictions)) {
            loaded = json.predictions.filter(isCompletePrediction)
            if (!cancelled) {
              setCached({ predictions: loaded, summary: typeof json.summary === 'string' ? json.summary : '' })
              setFetchedAt(typeof json.fetchedAt === 'string' ? json.fetchedAt : null)
              setServerStale(Boolean(json.stale))
            }
          }
        }
      } catch {
        // predictions are optional — chart still renders
      }

      try {
        const times = loaded.map(p => new Date(p.timestamp).getTime()).filter(Number.isFinite)
        const oldest = times.length > 0 ? Math.min(...times) : Date.now() - 7 * 24 * 3600 * 1000
        const tf = pickTimeframeForRange(oldest)
        const { ohlc } = await fetchOhlc(tf)
        if (!cancelled) {
          setTimeframe(tf)
          setOhlcData(clipOhlcToWindow(ohlc, oldest, Date.now()))
        }
      } catch (err) {
        console.warn('[PredictionWidget] OHLC load failed:', err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const regenerate = useCallback(async () => {
    try {
      const { ohlc } = await fetchOhlc('1H', true)
      setTimeframe('1H')
      setOhlcData(clipOhlcToWindow(ohlc, Date.now() - 7 * 24 * 3600 * 1000, Date.now()))
    } catch {
      // keep old candles
    }
    runExtraction({})
  }, [runExtraction])

  // Persist finished stream as the new "cached" state
  useEffect(() => {
    if (!isGenerating && streaming?.predictions && streaming.predictions.length > 0) {
      setCached({
        predictions: streaming.predictions.filter(isCompletePrediction),
        summary: typeof streaming.summary === 'string' ? streaming.summary : ''
      })
      setFetchedAt(new Date().toISOString())
      setServerStale(false)
    }
  }, [isGenerating, streaming])

  const predictions: Prediction[] = useMemo(() => {
    if (isGenerating && streaming?.predictions) return streaming.predictions.filter(isCompletePrediction)
    return cached?.predictions ?? []
  }, [isGenerating, streaming, cached])

  const summary = (isGenerating ? streaming?.summary : null) ?? cached?.summary ?? ''

  const grouped = useMemo(() => ({
    short: predictions.filter(p => p.timeframe === 'short'),
    mid: predictions.filter(p => p.timeframe === 'mid'),
    long: predictions.filter(p => p.timeframe === 'long')
  }), [predictions])

  // Only plot predictions that actually fall inside the chart window —
  // no fake spreading of out-of-range events.
  const chartEvents: TimelineEvent[] = useMemo(() => {
    if (ohlcData.length === 0) return []
    const start = ohlcData[0].timestamp
    const end = ohlcData[ohlcData.length - 1].timestamp + 24 * 3600 * 1000
    return predictions
      .filter(p => {
        const t = new Date(p.timestamp).getTime()
        return t >= start && t <= end
      })
      .slice(0, 20)
      .map(p => ({
        id: p.id,
        date: p.timestamp.split('T')[0],
        time: p.timestamp.split('T')[1]?.slice(0, 5) || '12:00',
        title: p.prediction.slice(0, 35) + (p.prediction.length > 35 ? '…' : ''),
        fullQuote: p.prediction,
        description: `@${p.username}`,
        type: 'prediction' as const,
        participants: [p.username],
        priceContext: p.direction === 'bullish' ? 'pump_call' : p.direction === 'bearish' ? 'dump_call' : 'analysis',
        sentiment: p.direction,
        priceAtQuote: p.priceAtPrediction,
        hasTimeframe: Boolean(p.targetDate)
      }))
  }, [predictions, ohlcData])

  const handleChartEventClick = useCallback((event: TimelineEvent) => {
    const prediction = predictions.find(p => p.id === event.id)
    if (prediction) setModalPrediction(prediction)
  }, [predictions])

  const visibleCards = useMemo(() => {
    if (showAll) return predictions
    const picks: Prediction[] = []
    for (const group of [grouped.short, grouped.mid, grouped.long]) {
      picks.push(...group.slice(0, 2))
    }
    return picks.length > 0 ? picks : predictions.slice(0, 6)
  }, [showAll, predictions, grouped])

  const bull = predictions.filter(p => p.direction === 'bullish').length
  const bear = predictions.filter(p => p.direction === 'bearish').length
  const bullPct = predictions.length > 0 ? Math.round((bull / predictions.length) * 100) : 0
  const bearPct = predictions.length > 0 ? Math.round((bear / predictions.length) * 100) : 0

  const stale = serverStale || isOlderThanHours(fetchedAt, 24)

  return (
    <>
      <WidgetFrame
        icon={Brain}
        kicker="Wettbüro"
        title="Prediction Market"
        fetchedAt={fetchedAt}
        stale={stale}
        fullscreenHref="/prediction"
        onRegenerate={regenerate}
        isGenerating={isGenerating}
        regenerateLabel="Neu extrahieren"
        statusText={predictions.length > 0
          ? `${grouped.short.length} kurz · ${grouped.mid.length} mittel · ${grouped.long.length} lang`
          : null}
      >
        {/* AI summary */}
        {summary && (
          <div className="mb-4 flex items-start gap-2 rounded-sm border border-primary/15 bg-background/40 p-3.5">
            <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary/70" />
            <p className="font-body text-sm italic leading-relaxed text-foreground/80">{summary}</p>
          </div>
        )}

        {/* Chart */}
        {isLoading ? (
          <ChartSkeleton height={420} />
        ) : ohlcData.length === 0 ? (
          <WidgetEmptyState icon={Brain} text="Keine Chart-Daten verfügbar." actionLabel="Erneut versuchen" onAction={regenerate} />
        ) : (
          <div className="overflow-hidden rounded-sm border border-primary/15 bg-background/50" style={{ height: 420 }}>
            <ChartJSCandlestick
              ohlcData={ohlcData}
              events={chartEvents}
              timeframe={timeframe}
              disableZoom
              minLineLength={80}
              onEventClick={handleChartEventClick}
            />
          </div>
        )}

        {/* Bull/Bear ratio */}
        {predictions.length > 0 && (
          <div className="mt-4 flex items-center gap-4 rounded-sm border border-primary/15 bg-background/40 px-4 py-2.5">
            <span className="flex items-center gap-1 whitespace-nowrap text-[10px] text-emerald-400">
              <TrendingUp className="h-3 w-3" /> {bullPct}%
            </span>
            <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-muted/40">
              <div className="bg-emerald-500 transition-all duration-700" style={{ width: `${bullPct}%` }} />
              <div className="bg-red-500 transition-all duration-700" style={{ width: `${bearPct}%` }} />
            </div>
            <span className="flex items-center gap-1 whitespace-nowrap text-[10px] text-red-400">
              {bearPct}% <TrendingDown className="h-3 w-3" />
            </span>
            <span className="border-l border-primary/15 pl-3 text-[10px] text-muted-foreground/60">
              {predictions.length} Vorhersagen
            </span>
          </div>
        )}

        {/* Prediction cards */}
        {predictions.length > 0 ? (
          <>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleCards.map(prediction => (
                <PredictionCard key={prediction.id} prediction={prediction} onClick={() => setModalPrediction(prediction)} />
              ))}
            </div>
            {!showAll && predictions.length > visibleCards.length && (
              <button
                onClick={() => setShowAll(true)}
                className="mt-3 w-full rounded-sm border border-primary/20 bg-primary/5 py-2.5 text-xs font-headline uppercase tracking-wider text-primary/80 transition-colors hover:bg-primary/10"
              >
                + {predictions.length - visibleCards.length} weitere anzeigen
              </button>
            )}
          </>
        ) : !isLoading && !isGenerating && (
          <div className="mt-4">
            <WidgetEmptyState
              icon={Brain}
              text="Noch keine Vorhersagen extrahiert. Jetzt den Chat der letzten 7 Tage durchsuchen?"
              actionLabel="Extraktion starten"
              onAction={regenerate}
            />
          </div>
        )}

        <div className="mt-4 text-right">
          <Link href="/prediction" className="text-xs text-primary/70 hover:text-primary hover:underline">
            Alle Vorhersagen im Wettbüro →
          </Link>
        </div>
      </WidgetFrame>

      {modalPrediction && <PredictionModal prediction={modalPrediction} onClose={() => setModalPrediction(null)} />}
    </>
  )
}
