'use client'

/**
 * ChartTimelineWidget — the full BTC chart timeline as a reusable,
 * newspaper-styled widget.
 *
 * Unlike the old mini widget it actually works with stale caches: the OHLC
 * timeframe is picked so the cached quotes land ON the chart, and a fresh
 * AI analysis can be streamed live via the regenerate button (same
 * endpoint as the /chart-timeline page).
 */

import { experimental_useObject as useObject } from '@ai-sdk/react'
import { Clock, Quote, Skull, Sparkles, TrendingUp, Trophy, X } from 'lucide-react'
import dynamic from 'next/dynamic'
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
  { ssr: false, loading: () => <ChartSkeleton height={500} /> }
)

// Must match /chart-timeline/api/analyze (server emits null for absent
// fields since OpenAI structured outputs forbid optional; old caches may
// omit them entirely → nullish accepts both)
const ChartQuoteSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  username: z.string(),
  title: z.string(),
  fullQuote: z.string(),
  story: z.string().nullish(),
  priceContext: z.enum([
    'pump_call', 'dump_call', 'top_call', 'bottom_call',
    'fomo', 'panic', 'diamond_hands', 'reversal', 'sideways', 'analysis'
  ]),
  sentiment: z.enum(['bullish', 'bearish', 'neutral']),
  wasCorrect: z.boolean().nullish(),
  priceAtQuote: z.number(),
  hasTimeframe: z.boolean().nullish()
})

const AnalysisResponseSchema = z.object({
  headline: z.string(),
  subheadline: z.string(),
  priceChange: z.object({
    startPrice: z.number(),
    endPrice: z.number(),
    changePercent: z.number(),
    trend: z.enum(['bullish', 'bearish', 'sideways'])
  }),
  quotes: z.array(ChartQuoteSchema),
  bestCall: z.object({ username: z.string(), quote: z.string(), context: z.string() }).nullish(),
  worstCall: z.object({ username: z.string(), quote: z.string(), context: z.string() }).nullish(),
  dataRange: z.object({
    messagesFrom: z.string(),
    messagesTo: z.string(),
    messageCount: z.number()
  }).nullish()
})

type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>

interface TimelineEvent {
  id: string
  date: string
  time: string
  title: string
  fullQuote: string
  story?: string
  description: string
  type: 'discussion' | 'prediction' | 'drama' | 'insight' | 'milestone' | 'humor'
  participants: string[]
  priceContext?: string
  sentiment?: string
  wasCorrect?: boolean
  priceAtQuote?: number
  hasTimeframe?: boolean
}

const CONTEXT_STYLES: Record<string, { border: string; bg: string; text: string; label: string }> = {
  pump_call: { border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: '📈 Pump Call' },
  bottom_call: { border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: '⬇️ Bottom Call' },
  dump_call: { border: 'border-red-500/40', bg: 'bg-red-500/10', text: 'text-red-400', label: '📉 Dump Call' },
  top_call: { border: 'border-red-500/40', bg: 'bg-red-500/10', text: 'text-red-400', label: '⬆️ Top Call' },
  fomo: { border: 'border-amber-500/40', bg: 'bg-amber-500/10', text: 'text-amber-400', label: '🚀 FOMO' },
  panic: { border: 'border-orange-500/40', bg: 'bg-orange-500/10', text: 'text-orange-400', label: '😱 Panik' },
  diamond_hands: { border: 'border-blue-500/40', bg: 'bg-blue-500/10', text: 'text-blue-400', label: '💎 Diamond Hands' },
  reversal: { border: 'border-purple-500/40', bg: 'bg-purple-500/10', text: 'text-purple-400', label: '🔄 Reversal' },
  analysis: { border: 'border-cyan-500/40', bg: 'bg-cyan-500/10', text: 'text-cyan-400', label: '📊 Analyse' },
  sideways: { border: 'border-slate-500/40', bg: 'bg-slate-500/10', text: 'text-slate-400', label: '↔️ Seitwärts' }
}

function contextStyle(context: string | undefined) {
  return CONTEXT_STYLES[context ?? ''] ?? { border: 'border-primary/25', bg: 'bg-primary/5', text: 'text-primary', label: '💬 Zitat' }
}

function quoteToEvent(quote: z.infer<typeof ChartQuoteSchema>): TimelineEvent {
  return {
    id: quote.id,
    date: quote.timestamp.split('T')[0] || new Date().toISOString().split('T')[0],
    time: quote.timestamp.split('T')[1]?.slice(0, 5) || '12:00',
    title: quote.title,
    fullQuote: quote.fullQuote || quote.title,
    story: quote.story ?? undefined,
    description: `@${quote.username}`,
    type: 'prediction',
    participants: [quote.username],
    priceContext: quote.priceContext,
    sentiment: quote.sentiment,
    wasCorrect: quote.wasCorrect ?? undefined,
    priceAtQuote: quote.priceAtQuote,
    hasTimeframe: quote.hasTimeframe ?? undefined
  }
}

function QuoteModal({ event, onClose }: { event: TimelineEvent; onClose: () => void }) {
  const style = contextStyle(event.priceContext)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`glass-card-gold relative w-full max-w-lg overflow-hidden rounded-sm border ${style.border}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between border-b ${style.border} px-5 py-4`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-headline font-bold uppercase tracking-wider ${style.text}`}>{style.label}</span>
            {event.hasTimeframe && (
              <span className="flex items-center gap-1 rounded-sm bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
                <Clock className="h-2.5 w-2.5" /> Zeitangabe
              </span>
            )}
            {event.wasCorrect !== undefined && (
              <span className={`rounded-sm px-1.5 py-0.5 text-[10px] ${event.wasCorrect ? 'bg-emerald-500/25 text-emerald-400' : 'bg-red-500/25 text-red-400'}`}>
                {event.wasCorrect ? '✓ Richtig' : '✗ Falsch'}
              </span>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 transition-colors hover:bg-foreground/10">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <h3 className="font-masthead text-xl leading-snug">&bdquo;{event.title}&ldquo;</h3>
          <blockquote className="rounded-sm border border-primary/15 bg-background/40 p-4">
            <p className="font-body text-sm italic leading-relaxed text-muted-foreground">&bdquo;{event.fullQuote}&ldquo;</p>
          </blockquote>
          {event.story && (
            <div>
              <h4 className="mb-1.5 text-[10px] font-headline font-bold uppercase tracking-[0.2em] text-primary/70">Die Geschichte</h4>
              <p className="font-body text-sm leading-relaxed text-foreground/85">{event.story}</p>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-primary/10 pt-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-headline font-semibold text-primary">@{event.participants[0]}</span>
              <span className="text-muted-foreground/50">•</span>
              <span className="text-xs text-muted-foreground">{event.date} {event.time}</span>
            </div>
            {event.priceAtQuote !== undefined && (
              <span className={`font-mono font-bold ${style.text}`}>${event.priceAtQuote.toLocaleString('de-DE')}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function QuoteCard({ event, onClick }: { event: TimelineEvent; onClick: () => void }) {
  const style = contextStyle(event.priceContext)
  return (
    <button
      onClick={onClick}
      className={`block w-full rounded-sm border ${style.border} ${style.bg} p-3 text-left transition-all hover:scale-[1.01] hover:brightness-125`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={`text-[10px] font-headline font-bold uppercase tracking-wider ${style.text}`}>{style.label}</span>
        <div className="flex items-center gap-1.5">
          {event.hasTimeframe && (
            <span className="flex items-center gap-1 rounded-sm bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-300">
              <Clock className="h-2.5 w-2.5" /> Zeit
            </span>
          )}
          {event.wasCorrect !== undefined && (
            <span className={`rounded-sm px-1.5 py-0.5 text-[9px] ${event.wasCorrect ? 'bg-emerald-500/25 text-emerald-400' : 'bg-red-500/25 text-red-400'}`}>
              {event.wasCorrect ? '✓' : '✗'}
            </span>
          )}
        </div>
      </div>
      <p className="font-body text-sm font-semibold leading-snug">&bdquo;{event.title}&ldquo;</p>
      {event.story && <p className="mt-1 line-clamp-2 font-body text-xs text-muted-foreground">{event.story}</p>}
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="font-headline text-primary/80">@{event.participants[0]}</span>
        <span className="font-mono">
          {event.date} {event.time} · ${event.priceAtQuote?.toLocaleString('de-DE')}
        </span>
      </div>
    </button>
  )
}

function CallHighlight({
  variant,
  call
}: {
  variant: 'best' | 'worst'
  call: { username: string; quote: string; context: string }
}) {
  const isBest = variant === 'best'
  return (
    <div className={`rounded-sm border p-4 ${isBest ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
      <div className="mb-2 flex items-center gap-2">
        {isBest ? <Trophy className="h-4 w-4 text-emerald-400" /> : <Skull className="h-4 w-4 text-red-400" />}
        <span className={`text-[10px] font-headline font-bold uppercase tracking-[0.2em] ${isBest ? 'text-emerald-400' : 'text-red-400'}`}>
          {isBest ? 'Bester Call' : 'Schlechtester Call'}
        </span>
      </div>
      <p className="font-body text-sm font-medium">&bdquo;{call.quote}&ldquo;</p>
      <p className="mt-1 text-xs text-muted-foreground">— <span className="font-headline text-primary/80">@{call.username}</span></p>
      <p className={`mt-2 text-xs ${isBest ? 'text-emerald-400/90' : 'text-red-400/90'}`}>{call.context}</p>
    </div>
  )
}

export function ChartTimelineWidget() {
  const [ohlcData, setOhlcData] = useState<OHLCData[]>([])
  const [timeframe, setTimeframe] = useState<OhlcTimeframe>('1H')
  const [cachedAnalysis, setCachedAnalysis] = useState<AnalysisResponse | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null)
  const [lastStream, setLastStream] = useState<AnalysisResponse | null>(null)

  const { object: streamingAnalysis, isLoading: isGenerating, submit: runAnalysis } = useObject({
    api: '/chart-timeline/api/analyze?force=true',
    schema: AnalysisResponseSchema
  })

  const analysis = (streamingAnalysis as AnalysisResponse | undefined) ?? lastStream ?? cachedAnalysis

  // Persist streamed data so it survives after the stream object resets
  useEffect(() => {
    const streamed = streamingAnalysis as AnalysisResponse | undefined
    if (streamed?.quotes && streamed.quotes.length > 0) setLastStream(streamed)
  }, [streamingAnalysis])

  useEffect(() => {
    if (!isGenerating && lastStream?.quotes && lastStream.quotes.length > 0) {
      setCachedAnalysis(lastStream)
      setFetchedAt(new Date().toISOString())
    }
  }, [isGenerating, lastStream])

  // Initial load: cached analysis first, then OHLC in a window that covers it
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        let loaded: AnalysisResponse | null = null
        try {
          const res = await fetch('/chart-timeline/api/analyze')
          if (res.ok) {
            const json = await res.json()
            if (json.cached && json.analysis) {
              loaded = json.analysis as AnalysisResponse
              if (!cancelled) {
                setCachedAnalysis(loaded)
                setFetchedAt(typeof json.fetchedAt === 'string' ? json.fetchedAt : null)
              }
            }
          }
        } catch {
          // analysis is optional — chart still renders
        }

        const quoteTimes = (loaded?.quotes ?? [])
          .map(q => new Date(q.timestamp).getTime())
          .filter(Number.isFinite)
        const oldest = quoteTimes.length > 0 ? Math.min(...quoteTimes) : Date.now() - 7 * 24 * 3600 * 1000
        const tf = pickTimeframeForRange(oldest)
        const { ohlc } = await fetchOhlc(tf)
        if (!cancelled) {
          setTimeframe(tf)
          setOhlcData(clipOhlcToWindow(ohlc, oldest, Date.now()))
        }
      } catch (err) {
        console.warn('[ChartTimelineWidget] load failed:', err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const regenerate = useCallback(async () => {
    setLastStream(null)
    // Fresh analysis covers the last 7 days → switch chart back to a fresh window
    try {
      const { ohlc } = await fetchOhlc('1H', true)
      setTimeframe('1H')
      setOhlcData(clipOhlcToWindow(ohlc, Date.now() - 7 * 24 * 3600 * 1000, Date.now()))
    } catch {
      // keep old candles if the refresh fails
    }
    runAnalysis({})
  }, [runAnalysis])

  const events: TimelineEvent[] = useMemo(() => {
    return (analysis?.quotes ?? [])
      .filter((q): q is z.infer<typeof ChartQuoteSchema> =>
        Boolean(q && q.id && q.title && q.username && q.timestamp))
      .map(quoteToEvent)
  }, [analysis])

  const priceChange = analysis?.priceChange
  const trendColor = priceChange?.trend === 'bullish'
    ? 'text-emerald-400'
    : priceChange?.trend === 'bearish' ? 'text-red-400' : 'text-amber-400'

  const stale = isOlderThanHours(fetchedAt, 24)

  return (
    <>
      <WidgetFrame
        icon={TrendingUp}
        kicker="Marktchronik"
        title="BTC Chart Timeline"
        fetchedAt={fetchedAt}
        stale={stale}
        fullscreenHref="/chart-timeline"
        onRegenerate={regenerate}
        isGenerating={isGenerating}
        statusText={analysis?.dataRange
          ? `${new Date(analysis.dataRange.messagesFrom).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} – ${new Date(analysis.dataRange.messagesTo).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} · ${analysis.dataRange.messageCount} Nachrichten`
          : null}
        footer={
          events.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground/70">
              <span className="flex items-center gap-1">
                <Quote className="h-3 w-3" /> {events.length} Zitate auf dem Chart — klicken für Story
              </span>
              <div className="flex flex-wrap gap-3">
                {['pump_call', 'dump_call', 'fomo', 'analysis'].map(ctx => {
                  const style = contextStyle(ctx)
                  return (
                    <span key={ctx} className="flex items-center gap-1">
                      <span className={`h-2 w-2 rounded-full border ${style.border} ${style.bg}`} />
                      {style.label}
                    </span>
                  )
                })}
              </div>
            </div>
          ) : undefined
        }
      >
        {/* Headline banner */}
        {(analysis?.headline || isGenerating) && (
          <div className="mb-5 rounded-sm border border-primary/15 bg-background/40 p-4">
            <div className="flex items-start gap-3">
              <Sparkles className={`mt-0.5 h-5 w-5 flex-shrink-0 ${trendColor}`} />
              <div className="min-w-0 flex-1">
                {analysis?.headline ? (
                  <>
                    <h3 className="font-masthead text-xl leading-tight sm:text-2xl">{analysis.headline}</h3>
                    {analysis.subheadline && (
                      <p className="mt-1 font-body text-sm italic text-muted-foreground">{analysis.subheadline}</p>
                    )}
                    {priceChange && (
                      <div className="mt-2 flex items-center gap-3 text-xs">
                        <span className="font-mono text-muted-foreground">
                          ${priceChange.startPrice?.toLocaleString('de-DE')} → ${priceChange.endPrice?.toLocaleString('de-DE')}
                        </span>
                        <span className={`font-mono font-bold ${trendColor}`}>
                          {(priceChange.changePercent ?? 0) > 0 ? '+' : ''}{priceChange.changePercent?.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="animate-pulse space-y-2">
                    <div className="h-5 w-3/4 rounded bg-primary/10" />
                    <div className="h-3 w-1/2 rounded bg-muted/40" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Chart */}
        {isLoading ? (
          <ChartSkeleton height={500} />
        ) : ohlcData.length === 0 ? (
          <WidgetEmptyState icon={TrendingUp} text="Keine Chart-Daten verfügbar." actionLabel="Erneut versuchen" onAction={regenerate} />
        ) : (
          <div className="overflow-hidden rounded-sm border border-primary/15 bg-background/50" style={{ height: 500 }}>
            <ChartJSCandlestick
              ohlcData={ohlcData}
              events={events}
              timeframe={timeframe}
              disableZoom
              minLineLength={90}
              onEventClick={setSelectedEvent}
            />
          </div>
        )}

        {/* Best & Worst Call */}
        {(analysis?.bestCall || analysis?.worstCall) && (
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {analysis.bestCall?.quote && <CallHighlight variant="best" call={analysis.bestCall} />}
            {analysis.worstCall?.quote && <CallHighlight variant="worst" call={analysis.worstCall} />}
          </div>
        )}

        {/* Quote grid */}
        {events.length > 0 && (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {events.map(event => (
              <QuoteCard key={event.id} event={event} onClick={() => setSelectedEvent(event)} />
            ))}
          </div>
        )}

        {/* Empty analysis prompt */}
        {!isLoading && !isGenerating && events.length === 0 && ohlcData.length > 0 && (
          <div className="mt-5">
            <WidgetEmptyState
              icon={Sparkles}
              text="Noch keine AI-Analyse vorhanden. Jetzt eine frische Wochen-Analyse generieren?"
              actionLabel="Analyse starten"
              onAction={regenerate}
            />
          </div>
        )}
      </WidgetFrame>

      {selectedEvent && <QuoteModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </>
  )
}
