'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { 
  RefreshCw, 
  TrendingUp, 
  TrendingDown,
  Flame, 
  ChartBar, 
  Crosshair,
  Sparkles,
  Coins,
  Trophy,
  Clock,
  AlertCircle,
  Database,
  X,
  Target,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { PredictionCard, PredictionCardSkeleton, type Prediction } from './components'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { z } from 'zod'

// Schema must match API
const PredictionSchema = z.object({
  id: z.string(),
  username: z.string(),
  avatar: z.string().optional(),
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
  emoji: z.string().optional(),
})

const ExtractResponseSchema = z.object({
  predictions: z.array(PredictionSchema).min(5).max(30),
  summary: z.string(),
})

// Dynamic import for Chart.js (SSR issues)
const ChartJSCandlestick = dynamic(
  () => import('../chart-timeline/components/ChartJSCandlestick').then(mod => mod.ChartJSCandlestick),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

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

type Timeframe = '15m' | '1H' | '4H' | '1D'

function ChartSkeleton() {
  return (
    <div className="w-full h-[350px] bg-zinc-900/50 rounded-lg animate-pulse flex items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
        <span className="text-muted-foreground text-sm">Chart lädt...</span>
      </div>
    </div>
  )
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Nie'
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffMins < 1) return 'Gerade eben'
  if (diffMins < 60) return `vor ${diffMins} Min.`
  if (diffHours < 24) return `vor ${diffHours} Std.`
  return `vor ${Math.floor(diffHours / 24)} Tag${diffHours >= 48 ? 'en' : ''}`
}

function getStoredCredits() {
  if (typeof window === 'undefined') return { available: 1000, total: 1000 }
  try {
    const stored = localStorage.getItem('prediction_credits')
    if (stored) return JSON.parse(stored)
  } catch { /* empty */ }
  return { available: 1000, total: 1000 }
}

// Direction style helpers (maps sentiment/priceContext to colors)
function getDirectionStyle(direction: string) {
  switch (direction) {
    case 'bullish':
    case 'pump_call':
      return { bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', text: 'text-emerald-400', label: '📈 Bullish' }
    case 'bearish':
    case 'dump_call':
      return { bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'text-red-400', label: '📉 Bearish' }
    default:
      return { bg: 'bg-zinc-500/20', border: 'border-zinc-500/50', text: 'text-zinc-400', label: '➡️ Neutral' }
  }
}

// ── Prediction Modal (same pattern as chart-timeline QuoteModal) ──────
function PredictionModal({ event, prediction, onClose }: {
  event: TimelineEvent
  prediction: Prediction | undefined
  onClose: () => void
}) {
  const style = getDirectionStyle(event.sentiment || '')

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const confidenceLabels: Record<string, string> = { low: 'Unsicher', medium: 'Normal', high: 'Sehr sicher' }
  const timeframeLabels: Record<string, string> = { short: '🔥 Kurzfristig', mid: '📊 Mittelfristig', long: '🎯 Langfristig' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`relative max-w-lg w-full rounded-xl border-2 ${style.border} ${style.bg} bg-zinc-950 shadow-2xl overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-5 py-4 border-b ${style.border} flex items-center justify-between`}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-sm font-bold uppercase tracking-wider ${style.text}`}>
              {style.label}
            </span>
            {prediction && (
              <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                {timeframeLabels[prediction.timeframe]}
              </span>
            )}
            {prediction && (
              <span className={`text-xs px-2 py-0.5 rounded ${
                prediction.confidence === 'high' ? 'bg-amber-500/20 text-amber-400' :
                prediction.confidence === 'low' ? 'bg-zinc-700 text-zinc-400' :
                'bg-zinc-800 text-zinc-300'
              }`}>
                {confidenceLabels[prediction.confidence]}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 transition-colors">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Prediction text */}
          <h3 className="text-xl font-bold leading-snug">
            „{event.title}“
          </h3>

          {/* Full original quote */}
          <div className="p-4 rounded-lg bg-white/5 border border-white/10">
            <p className="text-sm italic leading-relaxed text-zinc-400">
              „{event.fullQuote}“
            </p>
          </div>

          {/* Prediction details grid */}
          {prediction && (
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
          )}

          {/* Meta footer */}
          <div className="flex items-center justify-between pt-3 border-t border-white/10 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium text-zinc-200">@{event.participants[0]}</span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-500">{event.date} {event.time}</span>
            </div>
            {event.priceAtQuote && (
              <span className={`font-mono font-bold ${style.text}`}>
                ${event.priceAtQuote.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Streaming progress dots ────────────────────────────────────────────
function StreamingDots({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-purple-400">
      <div className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-1 h-1 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
      <span>KI extrahiert... {count > 0 ? `${count} Vorhersagen` : ''}</span>
    </div>
  )
}

// ── iMovie-style horizontal timeline track ────────────────────────────
function TimelineTrack({ 
  predictions, label, icon: Icon, color, onSelect, selectedId 
}: { 
  predictions: Prediction[]
  label: string
  icon: React.ElementType
  color: string
  onSelect: (p: Prediction) => void
  selectedId: string | null
}) {
  if (predictions.length === 0) return null
  
  return (
    <div className="flex items-stretch gap-2 min-h-[80px]">
      <div className={`w-28 flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-l-lg border-r-2 ${color}`}>
        <Icon className="w-4 h-4" />
        <div>
          <div className="text-xs font-semibold">{label}</div>
          <div className="text-[10px] opacity-70">{predictions.length} Wetten</div>
        </div>
      </div>
      <div className="flex-1 overflow-x-auto flex items-center gap-2 py-2">
        {predictions.map(p => {
          const isSelected = selectedId === p.id
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className={`flex-shrink-0 px-3 py-2 rounded-lg border transition-all duration-200 ${
                isSelected ? `${color} scale-105 shadow-lg` : 'bg-card/50 border-zinc-700 hover:border-zinc-600 hover:bg-card'
              }`}
              style={{ minWidth: 160, maxWidth: 200 }}
            >
              <div className="flex items-center gap-2 mb-1">
                {p.direction === 'bullish' ? <TrendingUp className="w-3 h-3 text-green-400" /> :
                 p.direction === 'bearish' ? <TrendingDown className="w-3 h-3 text-red-400" /> : null}
                <span className="text-xs font-medium truncate">@{p.username}</span>
              </div>
              <div className="text-[11px] text-left line-clamp-2 text-muted-foreground">{p.prediction}</div>
              {p.targetPrice && (
                <div className="text-xs font-mono mt-1 text-amber-400">${(p.targetPrice / 1000).toFixed(1)}k</div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════════════

export default function PredictionMarketPage() {
  const [isMounted, setIsMounted] = useState(false)
  const [timeframe, setTimeframe] = useState<Timeframe>('15m')
  const [ohlcData, setOhlcData] = useState<OHLCData[]>([])
  const [isLoadingOhlc, setIsLoadingOhlc] = useState(true)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [isCached, setIsCached] = useState(false)
  const [isStale, setIsStale] = useState(false)
  const [currentPrice, setCurrentPrice] = useState(0)
  const [credits, setCredits] = useState({ available: 1000, total: 1000 })
  const [userBets, setUserBets] = useState<Record<string, 'yes' | 'no'>>({})
  const [pools, setPools] = useState<Record<string, { yes: number; no: number }>>({})
  const [selectedPrediction, setSelectedPrediction] = useState<Prediction | null>(null)
  const [minLineLength, setMinLineLength] = useState(100)
  const [modalEvent, setModalEvent] = useState<TimelineEvent | null>(null)

  const [cachedPredictions, setCachedPredictions] = useState<Prediction[]>([])
  const [cachedSummary, setCachedSummary] = useState('')
  const [lastStreamData, setLastStreamData] = useState<{ predictions: Prediction[]; summary: string } | null>(null)

  // Streaming AI hook
  const { object: streamingData, isLoading: isAnalyzing, submit: runAnalysis } = useObject({
    api: '/prediction/api/extract',
    schema: ExtractResponseSchema,
  })

  useEffect(() => {
    if (streamingData?.predictions && streamingData.predictions.length > 0) {
      setLastStreamData({
        predictions: streamingData.predictions as Prediction[],
        summary: streamingData.summary ?? '',
      })
    }
  }, [streamingData])

  useEffect(() => {
    if (!isAnalyzing && lastStreamData?.predictions?.length) {
      setFetchedAt(new Date().toISOString())
      setIsCached(false)
      setIsStale(false)
    }
  }, [isAnalyzing, lastStreamData])

  // Active predictions: live stream → last stream → cache
  const activePredictions: Prediction[] = useMemo(() => {
    const raw = lastStreamData?.predictions ?? cachedPredictions
    return raw.filter((p): p is Prediction =>
      p !== undefined &&
      typeof p.id === 'string' &&
      typeof p.username === 'string' &&
      typeof p.prediction === 'string' &&
      typeof p.timestamp === 'string'
    )
  }, [lastStreamData, cachedPredictions])

  const activeSummary = lastStreamData?.summary ?? cachedSummary

  useEffect(() => {
    setIsMounted(true)
    setCredits(getStoredCredits())
    try {
      const storedBets = localStorage.getItem('prediction_bets')
      if (storedBets) setUserBets(JSON.parse(storedBets))
      const storedPools = localStorage.getItem('prediction_pools')
      if (storedPools) setPools(JSON.parse(storedPools))
    } catch { /* empty */ }
  }, [])

  const fetchOHLC = useCallback(async (tf: Timeframe) => {
    try {
      const res = await fetch(`/chart-timeline/api/ohlc?timeframe=${tf}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.ohlc?.length > 0) setCurrentPrice(data.ohlc[data.ohlc.length - 1].close)
      setOhlcData(data.ohlc || [])
    } catch { /* ignore */ }
  }, [])

  const loadCache = useCallback(async () => {
    try {
      const res = await fetch('/prediction/api/extract')
      if (!res.ok) return
      const data = await res.json()
      if (data.predictions?.length > 0) {
        setCachedPredictions(data.predictions)
        setCachedSummary(data.summary ?? '')
        setFetchedAt(data.fetchedAt)
        setIsCached(true)
        setIsStale(data.stale ?? false)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    async function init() {
      setIsLoadingOhlc(true)
      await Promise.all([fetchOHLC(timeframe), loadCache()])
      setIsLoadingOhlc(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isMounted && !isLoadingOhlc) fetchOHLC(timeframe)
  }, [timeframe, isMounted]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => {
    setLastStreamData(null)
    runAnalysis({})
  }

  const handleBet = (prediction: Prediction, type: 'yes' | 'no') => {
    const betAmount = 10
    if (credits.available < betAmount) { alert('Nicht genug Credits!'); return }
    if (userBets[prediction.id]) { alert('Du hast bereits gewettet!'); return }
    const newCredits = { ...credits, available: credits.available - betAmount }
    setCredits(newCredits)
    localStorage.setItem('prediction_credits', JSON.stringify(newCredits))
    const newBets = { ...userBets, [prediction.id]: type }
    setUserBets(newBets)
    localStorage.setItem('prediction_bets', JSON.stringify(newBets))
    const currentPool = pools[prediction.id] || { yes: 50, no: 50 }
    const newPool = { ...currentPool, [type]: currentPool[type] + betAmount }
    setPools({ ...pools, [prediction.id]: newPool })
    localStorage.setItem('prediction_pools', JSON.stringify({ ...pools, [prediction.id]: newPool }))
  }

  // Chart events — spread across visible range when timestamps are out of window
  const chartEvents: TimelineEvent[] = useMemo(() => {
    if (ohlcData.length === 0) return []
    const chartStart = ohlcData[0]?.timestamp || 0
    const chartEnd = ohlcData[ohlcData.length - 1]?.timestamp || Date.now()
    const chartRange = chartEnd - chartStart

    return activePredictions.slice(0, 25).map((p, idx) => {
      const t = new Date(p.timestamp).getTime()
      let mappedTs: string
      if (t >= chartStart && t <= chartEnd) {
        mappedTs = p.timestamp
      } else {
        const spread = chartStart + (chartRange / (activePredictions.length + 1)) * (idx + 1)
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
  }, [activePredictions, ohlcData])

  const findPrediction = (eventId: string) => activePredictions.find(p => p.id === eventId)

  const grouped = useMemo(() => ({
    short: activePredictions.filter(p => p.timeframe === 'short'),
    mid: activePredictions.filter(p => p.timeframe === 'mid'),
    long: activePredictions.filter(p => p.timeframe === 'long'),
  }), [activePredictions])

  const timeframeOptions: Timeframe[] = ['15m', '1H', '4H', '1D']
  const streamingCount = streamingData?.predictions?.length ?? 0

  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="fixed inset-0 bg-gradient-to-br from-purple-900/10 via-zinc-950 to-zinc-950 pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800">
          <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <h1 className="font-bold text-lg bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                Prediction Market
              </h1>
            </div>
            <div className="flex items-center gap-3">
              {isMounted && currentPrice > 0 && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-lg border border-zinc-800">
                  <span className="text-xs text-zinc-500">BTC</span>
                  <span className="font-mono font-bold text-amber-400">${currentPrice.toLocaleString()}</span>
                </div>
              )}
              {isMounted && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-lg border border-zinc-800">
                  <Coins className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-amber-400 tabular-nums">{credits.available}</span>
                </div>
              )}
              <ThemeSwitcher />
            </div>
          </div>
        </header>

        {/* Controls Bar */}
        <div className="border-b border-zinc-800 bg-zinc-900/50">
          <div className="max-w-[1600px] mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Timeframe */}
              <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-0.5">
                {timeframeOptions.map(tf => (
                  <button key={tf} onClick={() => setTimeframe(tf)}
                    className={`px-3 py-1 text-xs font-mono rounded transition-all ${
                      timeframe === tf ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >{tf}</button>
                ))}
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1 text-orange-400"><Flame className="w-3 h-3" />{grouped.short.length}</span>
                <span className="flex items-center gap-1 text-blue-400"><ChartBar className="w-3 h-3" />{grouped.mid.length}</span>
                <span className="flex items-center gap-1 text-purple-400"><Crosshair className="w-3 h-3" />{grouped.long.length}</span>
                <span className="flex items-center gap-1 text-emerald-400"><Trophy className="w-3 h-3" />{Object.keys(userBets).length}</span>
              </div>

              {/* Line length slider */}
              <div className="flex items-center gap-2 border-l border-zinc-700 pl-3">
                <label className="text-xs text-zinc-500 whitespace-nowrap">Linienlänge:</label>
                <input
                  type="range" min="50" max="150" value={minLineLength}
                  onChange={(e) => setMinLineLength(Number(e.target.value))}
                  className="w-20 h-1 accent-purple-500 cursor-pointer"
                />
                <span className="text-xs font-mono text-zinc-500 w-8">{minLineLength}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {isCached && !isAnalyzing && (
                <span className="flex items-center gap-1 text-xs text-emerald-400 px-2 py-1 bg-emerald-500/10 rounded border border-emerald-500/20">
                  <Database className="w-3 h-3" />{isStale ? 'Veraltet' : 'Cached'}
                </span>
              )}
              {fetchedAt && !isAnalyzing && (
                <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />{formatRelativeTime(fetchedAt)}
                </span>
              )}
              {isAnalyzing && <StreamingDots count={streamingCount} />}
              <button
                onClick={handleRefresh} disabled={isAnalyzing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-purple-600/20 text-purple-400 border border-purple-600/30 hover:bg-purple-600/30 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isAnalyzing ? 'animate-spin' : ''}`} />
                {isAnalyzing ? 'Analysiere...' : 'Neu laden'}
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-[1600px] mx-auto p-4 space-y-4">

          {activeSummary && (
            <div className="p-3 rounded-lg bg-purple-900/20 border border-purple-800/30">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-purple-200">{activeSummary}</p>
              </div>
            </div>
          )}

          {/* Chart */}
          <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/50" style={{ height: 450 }}>
            {isLoadingOhlc ? <ChartSkeleton /> : ohlcData.length > 0 ? (
              <ChartJSCandlestick
                ohlcData={ohlcData}
                events={chartEvents}
                timeframe={timeframe}
                disableZoom={false}
                minLineLength={minLineLength}
                onEventClick={setModalEvent}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-500">Keine Chart-Daten</div>
            )}
          </div>

          {/* Timeline Tracks */}
          <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/30">
            <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-300">📽️ Prediction Timeline</h2>
              <span className="text-[10px] text-zinc-500">← Scroll horizontal →</span>
            </div>
            {isAnalyzing && activePredictions.length === 0 ? (
              <div className="p-8 flex items-center justify-center">
                <div className="flex items-center gap-3 text-zinc-500">
                  <div className="w-5 h-5 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                  <span className="text-sm">Vorhersagen werden extrahiert...</span>
                </div>
              </div>
            ) : activePredictions.length === 0 ? (
              <div className="p-8 flex flex-col items-center justify-center text-center">
                <AlertCircle className="w-8 h-8 text-zinc-600 mb-2" />
                <p className="text-sm text-zinc-500 mb-2">Keine Vorhersagen gefunden</p>
                <button onClick={handleRefresh}
                  className="text-xs px-3 py-1.5 bg-purple-600/20 text-purple-400 rounded border border-purple-600/30 hover:bg-purple-600/30">
                  Vorhersagen generieren
                </button>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/50">
                <TimelineTrack predictions={grouped.short} label="Kurzfristig" icon={Flame}
                  color="bg-orange-900/30 border-orange-500 text-orange-400"
                  onSelect={setSelectedPrediction} selectedId={selectedPrediction?.id || null} />
                <TimelineTrack predictions={grouped.mid} label="Mittelfristig" icon={ChartBar}
                  color="bg-blue-900/30 border-blue-500 text-blue-400"
                  onSelect={setSelectedPrediction} selectedId={selectedPrediction?.id || null} />
                <TimelineTrack predictions={grouped.long} label="Langfristig" icon={Crosshair}
                  color="bg-purple-900/30 border-purple-500 text-purple-400"
                  onSelect={setSelectedPrediction} selectedId={selectedPrediction?.id || null} />
              </div>
            )}
          </div>

          {/* Selected Prediction Detail */}
          {selectedPrediction && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PredictionCard
                prediction={selectedPrediction} currentPrice={currentPrice}
                onBetYes={(p) => handleBet(p, 'yes')} onBetNo={(p) => handleBet(p, 'no')}
                yesPool={pools[selectedPrediction.id]?.yes || 50}
                noPool={pools[selectedPrediction.id]?.no || 50}
                userBet={userBets[selectedPrediction.id] || null}
              />
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-3 text-zinc-300">Wett-Details</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Preis bei Vorhersage:</span>
                    <span className="font-mono text-zinc-300">${selectedPrediction.priceAtPrediction.toLocaleString()}</span>
                  </div>
                  {selectedPrediction.targetPrice && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Zielpreis:</span>
                      <span className="font-mono text-amber-400">${selectedPrediction.targetPrice.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Deadline:</span>
                    <span className="text-zinc-300">{selectedPrediction.targetDateText}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Richtung:</span>
                    <span className={selectedPrediction.direction === 'bullish' ? 'text-green-400' : selectedPrediction.direction === 'bearish' ? 'text-red-400' : 'text-zinc-400'}>
                      {selectedPrediction.direction === 'bullish' ? '📈 Bullish' : selectedPrediction.direction === 'bearish' ? '📉 Bearish' : '➡️ Neutral'}
                    </span>
                  </div>
                  {currentPrice > 0 && selectedPrediction.targetPrice && (
                    <div className="flex justify-between pt-2 border-t border-zinc-800">
                      <span className="text-zinc-500">Differenz zu Ziel:</span>
                      <span className={selectedPrediction.targetPrice > currentPrice ? 'text-green-400' : 'text-red-400'}>
                        {selectedPrediction.targetPrice > currentPrice ? '+' : ''}
                        {((selectedPrediction.targetPrice - currentPrice) / currentPrice * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* All Predictions Grid */}
          {!selectedPrediction && activePredictions.length > 0 && (
            <div className="space-y-6">
              {grouped.short.length > 0 && (
                <section>
                  <h2 className="flex items-center gap-2 text-sm font-bold mb-3">
                    <Flame className="w-4 h-4 text-orange-400" />
                    <span className="text-orange-400">Kurzfristig</span>
                    <span className="text-[10px] text-zinc-500 font-normal">(Tage)</span>
                    {isAnalyzing && <span className="text-xs text-purple-400 animate-pulse">• lädt</span>}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {grouped.short.slice(0, 6).map(p => (
                      <PredictionCard key={p.id} prediction={p} currentPrice={currentPrice}
                        onBetYes={(pred) => handleBet(pred, 'yes')} onBetNo={(pred) => handleBet(pred, 'no')}
                        yesPool={pools[p.id]?.yes || 50} noPool={pools[p.id]?.no || 50} userBet={userBets[p.id] || null} />
                    ))}
                  </div>
                </section>
              )}
              {grouped.mid.length > 0 && (
                <section>
                  <h2 className="flex items-center gap-2 text-sm font-bold mb-3">
                    <ChartBar className="w-4 h-4 text-blue-400" />
                    <span className="text-blue-400">Mittelfristig</span>
                    <span className="text-[10px] text-zinc-500 font-normal">(Wochen)</span>
                    {isAnalyzing && <span className="text-xs text-purple-400 animate-pulse">• lädt</span>}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {grouped.mid.slice(0, 6).map(p => (
                      <PredictionCard key={p.id} prediction={p} currentPrice={currentPrice}
                        onBetYes={(pred) => handleBet(pred, 'yes')} onBetNo={(pred) => handleBet(pred, 'no')}
                        yesPool={pools[p.id]?.yes || 50} noPool={pools[p.id]?.no || 50} userBet={userBets[p.id] || null} />
                    ))}
                  </div>
                </section>
              )}
              {grouped.long.length > 0 && (
                <section>
                  <h2 className="flex items-center gap-2 text-sm font-bold mb-3">
                    <Crosshair className="w-4 h-4 text-purple-400" />
                    <span className="text-purple-400">Langfristig</span>
                    <span className="text-[10px] text-zinc-500 font-normal">(Monate)</span>
                    {isAnalyzing && <span className="text-xs text-purple-400 animate-pulse">• lädt</span>}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {grouped.long.slice(0, 6).map(p => (
                      <PredictionCard key={p.id} prediction={p} currentPrice={currentPrice}
                        onBetYes={(pred) => handleBet(pred, 'yes')} onBetNo={(pred) => handleBet(pred, 'no')}
                        yesPool={pools[p.id]?.yes || 50} noPool={pools[p.id]?.no || 50} userBet={userBets[p.id] || null} />
                    ))}
                  </div>
                </section>
              )}
              {isAnalyzing && activePredictions.length > 0 && activePredictions.length < 15 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {Array.from({ length: 3 }).map((_, i) => <PredictionCardSkeleton key={i} />)}
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="border-t border-zinc-800 py-4 mt-8">
          <div className="max-w-[1600px] mx-auto px-4 text-center">
            <p className="text-[10px] text-zinc-600">
              Financial Retarded Times • Prediction Market Prototype • Credits sind nur zum Spaß
            </p>
          </div>
        </footer>
      </div>

      {/* Chart label click → Modal */}
      {modalEvent && (
        <PredictionModal
          event={modalEvent}
          prediction={findPrediction(modalEvent.id)}
          onClose={() => setModalEvent(null)}
        />
      )}
    </main>
  )
}
